#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?Set DATABASE_URL to the destination PostgreSQL connection string}"
backup_file="${1:-}"
if [[ -z "$backup_file" || ! -f "$backup_file" ]]; then
  echo "Usage: DATABASE_URL=... RESTORE_CONFIRM=true $0 /path/to/backup.dump" >&2
  exit 2
fi
if [[ "${RESTORE_CONFIRM:-false}" != "true" ]]; then
  echo 'Restore replaces objects in the target database. Set RESTORE_CONFIRM=true only after verifying the target.' >&2
  exit 2
fi

command -v pg_restore >/dev/null || { echo 'pg_restore is required' >&2; exit 1; }
pg_restore --clean --if-exists --no-owner --no-acl --dbname="$DATABASE_URL" "$backup_file"
echo 'Restore completed.'
