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
# Compose names the container after its project directory, which is the repo
# folder in dev (order-list-db-1) and /srv/parts on the droplet.
CONTAINER="${PG_CONTAINER:-parts-db-1}"
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

# The hazard is a dump that got cut off part-way — a half-written file looks
# fine until the day you need it. pg_dump writes a completion marker as its
# last line, so checking for that catches truncation exactly, and unlike a size
# floor it stays correct whether the database holds one order or a season's
# worth. (A fresh deployment legitimately dumps only a few KB.)
size=$(stat -c%s "$target")
if ! gunzip -c "$target" | tail -5 | grep -q 'PostgreSQL database dump complete'; then
  echo "$(date -uIs) FAILED: $target is truncated - no completion marker (${size} bytes)" >&2
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
