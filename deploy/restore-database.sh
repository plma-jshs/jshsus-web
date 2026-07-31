#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

readonly BACKUP_FILE="${1:?usage: restore-database.sh <backup-file> <confirmation>}"
readonly CONFIRMATION="${2:?usage: restore-database.sh <backup-file> <confirmation>}"
DEPLOY_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly DEPLOY_DIR
readonly BACKUP_DIR="$DEPLOY_DIR/backups"

if [[ ! "$BACKUP_FILE" =~ ^jshsus_v26-[0-9]{8}T[0-9]{9}Z\.sql\.gz$ ]]; then
  echo 'Backup filename is invalid.' >&2
  exit 2
fi
if [[ "$CONFIRMATION" != "restore:jshsus_v26:$BACKUP_FILE" ]]; then
  echo 'Restore confirmation does not exactly match the selected backup.' >&2
  exit 2
fi

backup_path="$(realpath -e -- "$BACKUP_DIR/$BACKUP_FILE")"
checksum_path="$(realpath -e -- "$BACKUP_DIR/$BACKUP_FILE.sha256")"
case "$backup_path" in
  "$BACKUP_DIR"/*) ;;
  *)
    echo 'Backup resolves outside the protected backup directory.' >&2
    exit 2
    ;;
esac
[[ "$checksum_path" == "$backup_path.sha256" ]]

exec 9>"$DEPLOY_DIR/.deploy.lock"
if ! flock -n 9; then
  echo 'A deployment or restore is already running.' >&2
  exit 1
fi

current_env="$(readlink -f -- "$DEPLOY_DIR/.env")"
current_manifest="$(readlink -f -- "$DEPLOY_DIR/.compose.yml")"
current_tag="$(<"$DEPLOY_DIR/.current-tag")"
case "$current_env" in "$DEPLOY_DIR/.release-env"/*) ;; *) exit 2 ;; esac
case "$current_manifest" in "$DEPLOY_DIR/.release-manifests"/*) ;; *) exit 2 ;; esac
[[ "$current_tag" =~ ^[0-9a-f]{40}$ ]]

export IMAGE_TAG="$current_tag"
export GHCR_NAMESPACE="${GHCR_NAMESPACE:-plma-jshs}"
export DEPLOY_ENV_FILE="$current_env"
export DEPLOY_COMPOSE_FILE="$current_manifest"

compose() {
  docker compose \
    --project-directory "$DEPLOY_DIR" \
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
  [[ -n "$container_id" ]]
  for ((attempt = 1; attempt <= attempts; attempt += 1)); do
    status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id")"
    case "$status" in
      healthy) return 0 ;;
      unhealthy | exited | dead)
        docker logs --tail 100 "$container_id" >&2 || true
        return 1
        ;;
    esac
    sleep 2
  done
  docker logs --tail 100 "$container_id" >&2 || true
  return 1
}

echo "Stopping application services for protected database restore"
compose stop web admin api redis

echo "Creating an incident-state backup before restore"
compose --profile tools run --rm backup

echo "Restoring verified backup: $BACKUP_FILE"
compose --profile tools run --rm \
  --volume "$backup_path:/restore/$BACKUP_FILE:ro" \
  --volume "$checksum_path:/restore/$BACKUP_FILE.sha256:ro" \
  --env "RESTORE_BACKUP_PATH=/restore/$BACKUP_FILE" \
  --env "RESTORE_CONFIRMATION=$CONFIRMATION" \
  migrate node scripts/restore-database.cjs

echo 'Applying forward-only migrations to the restored database'
compose --profile tools run --rm migrate

echo 'Restarting application services'
compose up -d --no-deps --force-recreate redis
wait_for_health redis 30
compose up -d --no-deps --force-recreate api
wait_for_health api 45
compose up -d --no-deps --force-recreate web admin
wait_for_health web 30
wait_for_health admin 30
compose exec -T web sh -ec \
  "wget -qO- http://127.0.0.1/api/health | grep -q '\"status\":\"ok\"'"
compose ps
echo "Protected database restore completed: backup=$BACKUP_FILE release=$current_tag"
