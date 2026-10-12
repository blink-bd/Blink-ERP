#!/usr/bin/env bash
set -euo pipefail
umask 077

: "${DATABASE_URL:?Set DATABASE_URL to the PostgreSQL connection string}"
: "${BACKUP_S3_ENDPOINT:?Set BACKUP_S3_ENDPOINT (for example, your S3-compatible endpoint)}"
: "${BACKUP_S3_BUCKET:?Set BACKUP_S3_BUCKET}"
: "${AWS_ACCESS_KEY_ID:?Set AWS_ACCESS_KEY_ID}"
: "${AWS_SECRET_ACCESS_KEY:?Set AWS_SECRET_ACCESS_KEY}"

command -v pg_dump >/dev/null || { echo 'pg_dump is required' >&2; exit 1; }
command -v aws >/dev/null || { echo 'AWS CLI is required' >&2; exit 1; }

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
prefix="${BACKUP_S3_PREFIX:-blink-erp/postgres}"
object_key="${prefix%/}/${stamp}.dump"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT
backup_file="${tmp_dir}/database-${stamp}.dump"

pg_dump --format=custom --compress=9 --no-owner --no-acl --file="$backup_file" "$DATABASE_URL"

aws_args=(--endpoint-url "$BACKUP_S3_ENDPOINT" s3 cp "$backup_file" "s3://${BACKUP_S3_BUCKET}/${object_key}" --only-show-errors)
if [[ -n "${BACKUP_S3_SERVER_SIDE_ENCRYPTION:-}" ]]; then
  aws_args+=(--sse "$BACKUP_S3_SERVER_SIDE_ENCRYPTION")
fi
aws "${aws_args[@]}"

echo "Backup uploaded: s3://${BACKUP_S3_BUCKET}/${object_key}"
if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  echo "object_key=${object_key}" >> "$GITHUB_OUTPUT"
fi
