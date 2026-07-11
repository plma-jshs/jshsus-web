#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

readonly SERVER_ROOT="${SERVER_ROOT:-/home/ubuntu/Server}"
readonly BACKUP_ROOT="${BACKUP_ROOT:-$SERVER_ROOT/backups/jshsus-v26}"
readonly NPM_ROOT="${NPM_ROOT:-$SERVER_ROOT/nginx-proxy-manager}"
readonly DATABASE_NAME="${DATABASE_NAME:-jshsus_v26}"
readonly BACKUP_DATABASE="${BACKUP_DATABASE:-false}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
readonly STAMP
readonly DESTINATION="$BACKUP_ROOT/$STAMP"

case "$BACKUP_ROOT" in
  "$SERVER_ROOT"/backups/*) ;;
  *)
    echo 'BACKUP_ROOT must remain below SERVER_ROOT/backups.' >&2
    exit 2
    ;;
esac

install -d -m 700 "$DESTINATION"

sudo docker ps --no-trunc --format '{{json .}}' | tee "$DESTINATION/docker-containers.jsonl" >/dev/null
sudo docker network ls --no-trunc --format '{{json .}}' | tee "$DESTINATION/docker-networks.jsonl" >/dev/null
sudo ss -lntup | tee "$DESTINATION/listening-sockets.txt" >/dev/null
free -h > "$DESTINATION/memory.txt"
df -h > "$DESTINATION/disk.txt"

if [[ -d "$NPM_ROOT" ]]; then
  sudo tar --create --gzip --file "$DESTINATION/nginx-proxy-manager.tar.gz" \
    --directory "$NPM_ROOT" .
else
  echo "Nginx Proxy Manager directory not found: $NPM_ROOT" >&2
  exit 1
fi

if [[ "$BACKUP_DATABASE" == 'true' ]]; then
  sudo mysqldump \
    --single-transaction \
    --routines \
    --events \
    --triggers \
    --hex-blob \
    --no-tablespaces \
    --databases "$DATABASE_NAME" | gzip -9 > "$DESTINATION/$DATABASE_NAME.sql.gz"
fi

sudo chown -R "$(id -u):$(id -g)" "$DESTINATION"
chmod -R go-rwx "$DESTINATION"
sha256sum "$DESTINATION"/*.gz > "$DESTINATION/SHA256SUMS"

(
  cd "$DESTINATION"
  sha256sum --check SHA256SUMS
)

echo "$DESTINATION"
