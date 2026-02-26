#!/usr/bin/env bash
# backup_db.sh — Create a compressed SQLite backup
#
# Usage:
#   ./scripts/backup_db.sh [db_path] [backup_dir]
#
# Defaults:
#   db_path   = /data/cache.db
#   backup_dir = /data/backups
#
# Designed to run from cron or a scheduled Fly.io Machine process:
#   0 3 * * * /app/scripts/backup_db.sh

set -euo pipefail

DB_PATH="${1:-/data/cache.db}"
BACKUP_DIR="${2:-/data/backups}"
TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)
BACKUP_FILE="${BACKUP_DIR}/cache_${TIMESTAMP}.db.gz"
MAX_BACKUPS=7  # Keep last 7 daily backups

# Ensure backup directory exists
mkdir -p "$BACKUP_DIR"

if [ ! -f "$DB_PATH" ]; then
    echo "ERROR: Database file not found: $DB_PATH"
    exit 1
fi

# Use SQLite's .backup command for a consistent snapshot
echo "Starting backup of ${DB_PATH} → ${BACKUP_FILE}"
sqlite3 "$DB_PATH" ".backup '${BACKUP_DIR}/cache_${TIMESTAMP}.db'"

# Compress the backup
gzip "${BACKUP_DIR}/cache_${TIMESTAMP}.db"

BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "Backup complete: ${BACKUP_FILE} (${BACKUP_SIZE})"

# Rotate old backups — keep only the most recent MAX_BACKUPS
BACKUP_COUNT=$(ls -1 "${BACKUP_DIR}"/cache_*.db.gz 2>/dev/null | wc -l)
if [ "$BACKUP_COUNT" -gt "$MAX_BACKUPS" ]; then
    REMOVE_COUNT=$((BACKUP_COUNT - MAX_BACKUPS))
    ls -1t "${BACKUP_DIR}"/cache_*.db.gz | tail -n "$REMOVE_COUNT" | xargs rm -f
    echo "Rotated ${REMOVE_COUNT} old backup(s), keeping ${MAX_BACKUPS}"
fi

echo "Backup finished at $(date -u +%Y-%m-%dT%H:%M:%SZ)"
