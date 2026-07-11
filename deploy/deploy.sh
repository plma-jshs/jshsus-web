#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

readonly ACTION="${1:?usage: deploy.sh <image-tag>|--rollback [ghcr-namespace]}"
readonly GHCR_NAMESPACE="${2:-plma-jshs}"
DEPLOY_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly DEPLOY_DIR
readonly INCOMING_COMPOSE_FILE="$DEPLOY_DIR/docker-compose.release.yml"
readonly NEXT_ENV_FILE="$DEPLOY_DIR/.env.next"
readonly CURRENT_ENV_LINK="$DEPLOY_DIR/.env"
readonly CURRENT_COMPOSE_LINK="$DEPLOY_DIR/.compose.yml"
readonly CURRENT_TAG_FILE="$DEPLOY_DIR/.current-tag"
readonly PREVIOUS_ENV_LINK="$DEPLOY_DIR/.previous.env"
readonly PREVIOUS_COMPOSE_LINK="$DEPLOY_DIR/.previous.compose.yml"
readonly PREVIOUS_TAG_FILE="$DEPLOY_DIR/.previous-tag"
readonly RELEASE_ENV_DIR="$DEPLOY_DIR/.release-env"
readonly RELEASE_MANIFEST_DIR="$DEPLOY_DIR/.release-manifests"

cd "$DEPLOY_DIR"
umask 077
export DOCKER_CONFIG="$DEPLOY_DIR/.docker-auth"
install -d -m 700 "$DOCKER_CONFIG" "$RELEASE_ENV_DIR" "$RELEASE_MANIFEST_DIR"
exec 9>"$DEPLOY_DIR/.deploy.lock"
if ! flock -n 9; then
  echo 'Another deployment is already running.' >&2
  exit 1
fi

if [[ ! "$GHCR_NAMESPACE" =~ ^[a-z0-9][a-z0-9._-]*$ ]]; then
  echo 'Invalid GHCR namespace.' >&2
  exit 2
fi

if ! docker network inspect nginx-proxy-manager_default >/dev/null 2>&1; then
  echo 'Required Nginx Proxy Manager network does not exist.' >&2
  exit 1
fi

compose() {
  docker compose \
    --env-file "$DEPLOY_ENV_FILE" \
    --project-name jshsus-v26 \
    --file "$DEPLOY_COMPOSE_FILE" \
    "$@"
}

wait_for_health() {
  local service="$1"
  local attempts="${2:-45}"
  local container_id status

  container_id="$(compose ps -q "$service")"
  if [[ -z "$container_id" ]]; then
    echo "No container found for $service." >&2
    return 1
  fi

  for ((attempt = 1; attempt <= attempts; attempt += 1)); do
    status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id")"
    case "$status" in
      healthy)
        return 0
        ;;
      unhealthy | exited | dead)
        echo "$service entered state: $status" >&2
        docker logs --tail 100 "$container_id" >&2 || true
        return 1
        ;;
    esac
    sleep 2
  done

  echo "$service did not become healthy in time." >&2
  docker logs --tail 100 "$container_id" >&2 || true
  return 1
}

start_application() {
  compose up -d --no-deps --force-recreate redis
  wait_for_health redis 30
  compose up -d --no-deps --force-recreate api
  wait_for_health api 45
  compose up -d --no-deps --force-recreate web admin
  wait_for_health web 30
  wait_for_health admin 30
  compose exec -T web sh -ec \
    "wget -qO- http://127.0.0.1/api/health | grep -q '\"status\":\"ok\"'"
}

resolve_release_link() {
  local link="$1"
  local root="$2"
  local resolved

  [[ -L "$link" ]] || return 1
  resolved="$(readlink -f -- "$link")"
  case "$resolved" in
    "$root"/*) ;;
    *)
      echo "Release link points outside its state directory: $link" >&2
      return 2
      ;;
  esac
  [[ -s "$resolved" ]] || return 1
  printf '%s\n' "$resolved"
}

read_release_tag() {
  local file="$1"
  local tag

  [[ -s "$file" ]] || return 1
  tag="$(<"$file")"
  [[ "$tag" =~ ^[0-9a-f]{40}$ ]] || return 1
  printf '%s\n' "$tag"
}

set_release_link() {
  local link="$1"
  local target="$2"
  local root="$3"
  local relative temp

  case "$target" in
    "$root"/*) ;;
    *)
      echo "Refusing to link release state outside $root" >&2
      return 1
      ;;
  esac
  relative="$(realpath --relative-to="$DEPLOY_DIR" "$target")"
  temp="$link.tmp.$$"
  ln -s "$relative" "$temp"
  mv -Tf "$temp" "$link"
}

write_release_tag() {
  local file="$1"
  local tag="$2"
  local temp="$file.tmp.$$"

  printf '%s\n' "$tag" > "$temp"
  chmod 600 "$temp"
  mv -f "$temp" "$file"
}

load_current_state() {
  current_env=''
  current_manifest=''
  current_tag=''

  if [[ -e "$CURRENT_ENV_LINK" || -L "$CURRENT_ENV_LINK" || -e "$CURRENT_COMPOSE_LINK" || -L "$CURRENT_COMPOSE_LINK" || -e "$CURRENT_TAG_FILE" ]]; then
    current_env="$(resolve_release_link "$CURRENT_ENV_LINK" "$RELEASE_ENV_DIR")"
    current_manifest="$(resolve_release_link "$CURRENT_COMPOSE_LINK" "$RELEASE_MANIFEST_DIR")"
    current_tag="$(read_release_tag "$CURRENT_TAG_FILE")"
  fi
}

restore_application() {
  local tag="$1"
  local env_file="$2"
  local manifest_file="$3"

  if [[ ! "$tag" =~ ^[0-9a-f]{40}$ || ! -s "$env_file" || ! -s "$manifest_file" ]]; then
    echo 'No valid application release is available for rollback.' >&2
    return 1
  fi

  echo "Restoring application containers to $tag"
  export IMAGE_TAG="$tag"
  export DEPLOY_ENV_FILE="$env_file"
  export DEPLOY_COMPOSE_FILE="$manifest_file"
  compose config --quiet
  compose pull redis api web admin || echo 'Registry pull failed; trying retained local images.' >&2
  start_application
}

persist_success_state() {
  local tag="$1"
  local env_file="$2"
  local manifest_file="$3"

  if [[ -n "$current_tag" ]]; then
    set_release_link "$PREVIOUS_ENV_LINK" "$current_env" "$RELEASE_ENV_DIR"
    set_release_link "$PREVIOUS_COMPOSE_LINK" "$current_manifest" "$RELEASE_MANIFEST_DIR"
    write_release_tag "$PREVIOUS_TAG_FILE" "$current_tag"
  fi
  set_release_link "$CURRENT_ENV_LINK" "$env_file" "$RELEASE_ENV_DIR"
  set_release_link "$CURRENT_COMPOSE_LINK" "$manifest_file" "$RELEASE_MANIFEST_DIR"
  write_release_tag "$CURRENT_TAG_FILE" "$tag"
}

rollback_active_release() {
  local active_env active_manifest active_tag rollback_env rollback_manifest rollback_tag

  active_env="$(resolve_release_link "$CURRENT_ENV_LINK" "$RELEASE_ENV_DIR")"
  active_manifest="$(resolve_release_link "$CURRENT_COMPOSE_LINK" "$RELEASE_MANIFEST_DIR")"
  active_tag="$(read_release_tag "$CURRENT_TAG_FILE")"
  rollback_env="$(resolve_release_link "$PREVIOUS_ENV_LINK" "$RELEASE_ENV_DIR")"
  rollback_manifest="$(resolve_release_link "$PREVIOUS_COMPOSE_LINK" "$RELEASE_MANIFEST_DIR")"
  rollback_tag="$(read_release_tag "$PREVIOUS_TAG_FILE")"

  restore_application "$rollback_tag" "$rollback_env" "$rollback_manifest"

  set_release_link "$CURRENT_ENV_LINK" "$rollback_env" "$RELEASE_ENV_DIR"
  set_release_link "$CURRENT_COMPOSE_LINK" "$rollback_manifest" "$RELEASE_MANIFEST_DIR"
  write_release_tag "$CURRENT_TAG_FILE" "$rollback_tag"
  set_release_link "$PREVIOUS_ENV_LINK" "$active_env" "$RELEASE_ENV_DIR"
  set_release_link "$PREVIOUS_COMPOSE_LINK" "$active_manifest" "$RELEASE_MANIFEST_DIR"
  write_release_tag "$PREVIOUS_TAG_FILE" "$active_tag"
  compose ps
  echo "Rollback completed: $rollback_tag"
}

cleanup_old_images() {
  local keep_current="$1"
  local keep_previous="${2:-}"
  local service ref tag

  for service in api web admin migrate; do
    while IFS= read -r ref; do
      tag="${ref##*:}"
      if [[ "$tag" =~ ^[0-9a-f]{40}$ && "$tag" != "$keep_current" && "$tag" != "$keep_previous" ]]; then
        docker image rm "$ref" >/dev/null 2>&1 || true
      fi
    done < <(docker image ls --format '{{.Repository}}:{{.Tag}}' "ghcr.io/$GHCR_NAMESPACE/jshsus-$service")
  done
  docker image prune -f --filter 'until=168h' >/dev/null
}

if [[ "$ACTION" == '--rollback' ]]; then
  rollback_active_release
  exit 0
fi

readonly TARGET_TAG="$ACTION"
if [[ ! "$TARGET_TAG" =~ ^[0-9a-f]{40}$ ]]; then
  echo 'Refusing to deploy a non-commit image tag.' >&2
  exit 2
fi

available_kb="$(awk '/MemAvailable:/ {print $2}' /proc/meminfo)"
if ((available_kb < 350000)); then
  echo "Insufficient available memory before deployment: ${available_kb} KiB" >&2
  exit 1
fi

available_blocks="$(df -Pk "$DEPLOY_DIR" | awk 'NR == 2 {print $4}')"
if ((available_blocks < 2097152)); then
  echo "Insufficient free disk space before deployment: ${available_blocks} KiB" >&2
  exit 1
fi

test -s "$NEXT_ENV_FILE"
test -s "$INCOMING_COMPOSE_FILE"
chmod 600 "$NEXT_ENV_FILE" "$INCOMING_COMPOSE_FILE"

env_checksum="$(sha256sum "$NEXT_ENV_FILE" | awk '{print $1}')"
manifest_checksum="$(sha256sum "$INCOMING_COMPOSE_FILE" | awk '{print $1}')"
release_env="$RELEASE_ENV_DIR/$TARGET_TAG.$env_checksum.env"
release_manifest="$RELEASE_MANIFEST_DIR/$TARGET_TAG.$manifest_checksum.yml"
mv -f "$NEXT_ENV_FILE" "$release_env"
install -m 600 "$INCOMING_COMPOSE_FILE" "$release_manifest"
chmod 600 "$release_env"

redis_password_lines=()
mapfile -t redis_password_lines < <(grep -E '^REDIS_PASSWORD=' "$release_env" || true)
if ((${#redis_password_lines[@]} != 1)); then
  echo 'Production env must contain exactly one REDIS_PASSWORD.' >&2
  exit 1
fi
redis_password="${redis_password_lines[0]#REDIS_PASSWORD=}"
if [[ ! "$redis_password" =~ ^[A-Za-z0-9._~-]{32,128}$ ]]; then
  echo 'REDIS_PASSWORD must be 32-128 URI-safe characters.' >&2
  exit 1
fi
unset redis_password redis_password_lines

load_current_state

export GHCR_NAMESPACE
export IMAGE_TAG="$TARGET_TAG"
export DEPLOY_ENV_FILE="$release_env"
export DEPLOY_COMPOSE_FILE="$release_manifest"

compose config --quiet
echo "Pulling release images for $TARGET_TAG"
compose --profile tools pull

install -d -m 700 "$DEPLOY_DIR/backups"
echo 'Creating a logical database backup before migration'
compose --profile tools run --rm backup

echo 'Applying forward-only, backward-compatible database migrations'
compose --profile tools run --rm migrate

echo 'Starting isolated Redis and API services, followed by the frontends'
if ! start_application; then
  echo 'New application release failed its internal health checks.' >&2
  if [[ -n "$current_tag" ]]; then
    restore_application "$current_tag" "$current_env" "$current_manifest" || true
  fi
  exit 1
fi

persist_success_state "$TARGET_TAG" "$release_env" "$release_manifest"

export IMAGE_TAG="$TARGET_TAG"
export DEPLOY_ENV_FILE="$release_env"
export DEPLOY_COMPOSE_FILE="$release_manifest"
compose ps
cleanup_old_images "$TARGET_TAG" "$current_tag"
echo "Deployment completed: $TARGET_TAG"
