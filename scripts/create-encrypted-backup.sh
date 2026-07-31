#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$HOME/crm-backups}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUTPUT="$BACKUP_DIR/crm-backup-$TIMESTAMP.tar.gz.enc"
TEMP_DIR="$(mktemp -d)"
trap 'rm -rf -- "$TEMP_DIR"' EXIT

if [[ -z "${BACKUP_PASSPHRASE:-}" ]]; then
  echo "Set BACKUP_PASSPHRASE to a long secret before running this script." >&2
  exit 1
fi

for command_name in node tar openssl pg_dump; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Required command is missing: $command_name" >&2
    exit 1
  fi
done

mkdir -p "$BACKUP_DIR" "$TEMP_DIR/payload"
DATABASE_URL="$(cd "$APP_DIR" && node -e "require('dotenv').config({quiet:true}); process.stdout.write(process.env.DATABASE_URL || '')")"
if [[ -z "$DATABASE_URL" ]]; then
  echo "DATABASE_URL is missing from .env" >&2
  exit 1
fi

PGDATABASE="$DATABASE_URL" pg_dump --format=custom --file="$TEMP_DIR/payload/database.dump"
cp "$APP_DIR/.env" "$TEMP_DIR/payload/.env"
cp "$APP_DIR/ecosystem.config.js" "$TEMP_DIR/payload/ecosystem.config.js"
if [[ -d "$APP_DIR/.whatsapp-auth-new" ]]; then
  cp -a "$APP_DIR/.whatsapp-auth-new" "$TEMP_DIR/payload/.whatsapp-auth-new"
fi

printf 'Created UTC: %s\nApplication: %s\n' "$TIMESTAMP" "$APP_DIR" > "$TEMP_DIR/payload/MANIFEST.txt"
tar -C "$TEMP_DIR/payload" -czf "$TEMP_DIR/backup.tar.gz" .
openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000 \
  -in "$TEMP_DIR/backup.tar.gz" \
  -out "$OUTPUT" \
  -pass env:BACKUP_PASSPHRASE
chmod 600 "$OUTPUT"
printf 'Encrypted backup created: %s\nCopy it to storage outside this VPS.\n' "$OUTPUT"