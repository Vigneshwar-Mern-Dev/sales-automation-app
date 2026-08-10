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

if node -e "require('dotenv').config(); process.exit(process.env.WHATSAPP_WORKER_ENABLED === 'true' ? 0 : 1)"; then
  # Force the manager and all child senders to load the newly deployed worker code.
  pm2 restart crm-whatsapp-workers --update-env

  worker_check_ok=false
  for _attempt in $(seq 1 12); do
    if npm run whatsapp:workers:check; then
      worker_check_ok=true
      break
    fi
    sleep 5
  done
  if [[ "$worker_check_ok" != "true" ]]; then
    echo "WhatsApp worker manager could not reach the CRM account API after restart." >&2
    exit 1
  fi
fi

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
