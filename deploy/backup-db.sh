#!/usr/bin/env bash
#
# Nightly Postgres dump. Droplet snapshots cover "the box died"; this covers
# "someone deleted an order last Tuesday", which is the likelier one.
#
#   sudo cp deploy/backup-db.sh /usr/local/bin/backup-db.sh
#   sudo chmod +x /usr/local/bin/backup-db.sh
#   sudo crontab -e
#     15 3 * * *  /usr/local/bin/backup-db.sh >> /var/log/db-backup.log 2>&1
#
# A backup nobody has restored is a guess. Practise it once:
#   createdb restore_test && gunzip -c <dump> | psql restore_test

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/postgres}"
KEEP_DAYS="${KEEP_DAYS:-14}"
CONTAINER="${PG_CONTAINER:-order-list-db-1}"
DB_USER="${PG_USER:-postgres}"
DB_NAME="${PG_DATABASE:-postgres}"

mkdir -p "$BACKUP_DIR"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
target="$BACKUP_DIR/${DB_NAME}-${stamp}.sql.gz"

# Dump straight out of the container, compressed, to a temp name so a failure
# part-way through can't leave a truncated file looking like a good backup.
docker exec -i "$CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" \
  | gzip -9 > "$target.partial"
mv "$target.partial" "$target"

# A dump that restores nothing is usually a few hundred bytes.
size=$(stat -c%s "$target")
if [ "$size" -lt 10000 ]; then
  echo "$(date -uIs) FAILED: $target is only ${size} bytes" >&2
  exit 1
fi

echo "$(date -uIs) wrote $target (${size} bytes)"

# Off-box copy, if rclone is configured. Without this the backups die with the
# droplet, which defeats most of the point.
if command -v rclone >/dev/null && [ -n "${RCLONE_REMOTE:-}" ]; then
  rclone copy "$target" "$RCLONE_REMOTE" && \
    echo "$(date -uIs) copied to $RCLONE_REMOTE"
fi

find "$BACKUP_DIR" -name "${DB_NAME}-*.sql.gz" -mtime "+$KEEP_DAYS" -delete
