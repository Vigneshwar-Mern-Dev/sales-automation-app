#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

for command_name in node npm pm2 crontab; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Required command is missing: $command_name" >&2
    exit 1
  fi
done

if [[ ! -f .env ]]; then
  echo "Missing $APP_DIR/.env" >&2
  exit 1
fi

npm run prisma:deploy
npm run build
pm2 startOrReload ecosystem.config.js --update-env

if ! pm2 describe pm2-logrotate >/dev/null 2>&1; then
  pm2 install pm2-logrotate
fi
pm2 set pm2-logrotate:max_size 20M
pm2 set pm2-logrotate:retain 14
pm2 set pm2-logrotate:compress true
pm2 set pm2-logrotate:rotateInterval '0 0 * * *'
pm2 save

PM2_BIN="$(command -v pm2)"
NODE_BIN_DIR="$(dirname "$(command -v node)")"
REBOOT_ENTRY="@reboot PATH=$NODE_BIN_DIR:/usr/local/bin:/usr/bin:/bin $PM2_BIN resurrect"
CLEANUP_ENTRY="17 3 * * * cd $APP_DIR && $NODE_BIN_DIR/npm run cleanup:security >> $APP_DIR/security-cleanup.log 2>&1"
CURRENT_CRONTAB="$(crontab -l 2>/dev/null || true)"
{
  printf '%s\n' "$CURRENT_CRONTAB" | grep -vF "$PM2_BIN resurrect" | grep -vF "npm run cleanup:security" || true
  printf '%s\n' "$REBOOT_ENTRY" "$CLEANUP_ENTRY"
} | sed '/^[[:space:]]*$/d' | crontab -

pm2 status
printf '\nProduction setup complete. Reboot recovery and daily security cleanup are installed.\n'