#!/usr/bin/env bash
set -euo pipefail

#───────────────────────────────────────────────────────────────────────────────
# CRM Deployment Script
#
# Usage:
#   bash scripts/deploy.sh                    # full deploy
#   bash scripts/deploy.sh --skip-tests       # skip tests (use with caution)
#   bash scripts/deploy.sh --tarball-only     # create tarball without uploading
#   DEPLOY_SSH_AUTH=password bash scripts/deploy.sh --skip-tests
#
# Requirements:
#   - ssh/scp access to the server
#   - SSH key at ../aws-key.pem (relative to crm/)
#───────────────────────────────────────────────────────────────────────────────

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

SKIP_TESTS="${1:-}"
SERVER_USER="planlecrm"
SERVER_HOST="138.252.201.176"
SERVER_DIR="/home/planlecrm/htdocs/crm.planle.com"
PUBLIC_CRM_URL="https://crm.planle.com"
SSH_KEY="${APP_DIR}/../aws-key.pem"
SSH_AUTH_MODE="${DEPLOY_SSH_AUTH:-key}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
TARBALL_NAME="crm-deploy-${TIMESTAMP}.tar.gz"

echo "══════════════════════════════════════════════════════════════"
echo "  CRM Deployment — ${TIMESTAMP}"
echo "══════════════════════════════════════════════════════════════"

# ── Step 1: Pre-deploy tests ─────────────────────────────────────────────────

if [[ "$SKIP_TESTS" != "--skip-tests" && "$SKIP_TESTS" != "--tarball-only" ]]; then
  echo ""
  echo "▶ Step 1: Running tests..."
  npx vitest run
  echo "✓ All tests passed."
else
  echo ""
  echo "▶ Step 1: Tests skipped (${SKIP_TESTS})."
fi

# ── Step 2: Lint + Typecheck + Build ──────────────────────────────────────────

echo ""
echo "▶ Step 2: Validating and building..."
npm run prisma:validate
npm run lint
npm run build
echo "✓ Build complete."

# ── Step 3: Create deployment tarball ─────────────────────────────────────────

echo ""
echo "▶ Step 3: Creating deployment tarball..."

tar -czf "${APP_DIR}/../${TARBALL_NAME}" \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='.env' \
  --exclude='.whatsapp-auth*' \
  --exclude='.wwebjs_cache*' \
  --exclude='.whatsapp-worker-manager.lock' \
  --exclude='.git' \
  --exclude='logs' \
  --exclude='*.log' \
  --exclude='tsconfig.tsbuildinfo' \
  -C "${APP_DIR}/.." \
  crm

TARBALL_PATH="${APP_DIR}/../${TARBALL_NAME}"
TARBALL_SIZE=$(du -sh "$TARBALL_PATH" | cut -f1)
echo "✓ Tarball created: ${TARBALL_PATH} (${TARBALL_SIZE})"

if [[ "$SKIP_TESTS" == "--tarball-only" ]]; then
  echo ""
  echo "══════════════════════════════════════════════════════════════"
  echo "  Tarball ready: ${TARBALL_PATH}"
  echo "══════════════════════════════════════════════════════════════"
  exit 0
fi

# ── Step 4: Upload to server ──────────────────────────────────────────────────

echo ""
echo "▶ Step 4: Uploading to server..."

if [[ "$SSH_AUTH_MODE" != "key" && "$SSH_AUTH_MODE" != "password" ]]; then
  echo "DEPLOY_SSH_AUTH must be either key or password." >&2
  exit 1
fi

if [[ "$SSH_AUTH_MODE" == "key" && ! -f "$SSH_KEY" ]]; then
  echo "⚠ SSH key not found at ${SSH_KEY}"
  echo "  Upload manually:"
  echo "    scp -i <key> ${TARBALL_PATH} ${SERVER_USER}@${SERVER_HOST}:/tmp/${TARBALL_NAME}"
  echo ""
  echo "  Then SSH and run:"
  echo "    ssh -i <key> ${SERVER_USER}@${SERVER_HOST}"
  echo "    cd ${SERVER_DIR}"
  echo "    tar -xzf /tmp/${TARBALL_NAME} --strip-components=1"
  echo "    npm ci"
  echo "    npm run setup:production"
  echo "    pm2 status"
  echo ""
  exit 0
fi

SSH_ARGS=(-o StrictHostKeyChecking=no)
if [[ "$SSH_AUTH_MODE" == "key" ]]; then
  chmod 600 "$SSH_KEY"
  SSH_ARGS=(-i "$SSH_KEY" "${SSH_ARGS[@]}")
else
  echo "Password authentication selected. Enter the CloudPanel site-user password when prompted."
fi

scp "${SSH_ARGS[@]}" \
  "$TARBALL_PATH" "${SERVER_USER}@${SERVER_HOST}:/tmp/${TARBALL_NAME}"
echo "✓ Uploaded to server."

# ── Step 5: Deploy on server ──────────────────────────────────────────────────

echo ""
echo "▶ Step 5: Deploying on server..."

ssh "${SSH_ARGS[@]}" \
  "${SERVER_USER}@${SERVER_HOST}" << REMOTE_SCRIPT
set -euo pipefail
cd "${SERVER_DIR}"

echo "[server] Enforcing the public customer URL..."
for public_url_key in CRM_PUBLIC_URL NEXT_PUBLIC_CRM_URL; do
  if grep -q "^${public_url_key}=" .env; then
    sed -i "s|^${public_url_key}=.*|${public_url_key}=\${PUBLIC_CRM_URL}\|" .env
  else
    printf '%s="%s"\n' "${public_url_key}" "${PUBLIC_CRM_URL}" >> .env
  fi
done

echo "[server] Extracting deployment archive..."
tar -xzf "/tmp/${TARBALL_NAME}" --strip-components=1

echo "[server] Installing dependencies..."
npm ci

echo "[server] Running setup:production..."
npm run setup:production

echo "[server] Cleaning up..."
rm -f "/tmp/${TARBALL_NAME}"

echo ""
echo "[server] Verifying deployment..."
pm2 status
echo ""
echo "[server] ✓ Deployment complete!"
REMOTE_SCRIPT

# ── Step 6: Health check ──────────────────────────────────────────────────────

echo ""
echo "▶ Step 6: Health check..."
sleep 5

HTTP_CODE=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 \
  "https://crm.planle.com/login" 2>/dev/null || echo "000")

if [[ "$HTTP_CODE" == "200" || "$HTTP_CODE" == "302" || "$HTTP_CODE" == "307" ]]; then
  echo "✓ Health check passed (HTTP ${HTTP_CODE})."
else
  echo "⚠ Health check returned HTTP ${HTTP_CODE}. Check server logs."
fi

# ── Done ──────────────────────────────────────────────────────────────────────

echo ""
echo "══════════════════════════════════════════════════════════════"
echo "  Deployment complete!"
echo "  URL: https://crm.planle.com"
echo "  Verify: pm2 logs crm-next --lines 50 --nostream"
echo "══════════════════════════════════════════════════════════════"
