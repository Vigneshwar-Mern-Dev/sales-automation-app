# CRM production runbook

Production URL: `https://crm.planle.com`
Application directory: `/home/planlecrm/htdocs/crm.planle.com`
Application port: `127.0.0.1:3000`

## First deployment or update

Run these commands as the CloudPanel site user (`planlecrm`), not as root:

```bash
cd /home/planlecrm/htdocs/crm.planle.com
npm ci
chmod 700 scripts/setup-production.sh scripts/create-encrypted-backup.sh
npm run setup:production
```

`setup:production` applies pending Prisma migrations, builds Next.js, starts/reloads PM2, installs 20 MB log rotation with 14 retained files, saves the PM2 process list, installs reboot recovery, and schedules daily cleanup of stale rate-limit records.

Keep `WHATSAPP_WORKER_ENABLED=false` until WhatsApp is linked on the VPS. After linking it, change the value to `true` in `.env` and run `npm run setup:production` again.

## CloudPanel and Cloudflare

- CloudPanel site type must be a reverse proxy to `http://127.0.0.1:3000`.
- Cloudflare `A` record: name `crm`, content `138.252.201.176`.
- The site and Android app must use only `https://crm.planle.com`; do not use the server IP or `http://`.
- Keep Cloudflare SSL/TLS mode on **Full (strict)** after the CloudPanel certificate is installed.
- Firewall exposure should be limited to SSH, HTTP, and HTTPS. Port 3000 must not be public.

## Android app contract

- Base URL: `https://crm.planle.com`
- Registration: `POST /api/call-tracker/register`
- Heartbeat: `POST /api/call-tracker/heartbeat`
- Events: `POST /api/call-tracker/events`
- Store the returned `deviceToken` in Android encrypted storage and send it as `Authorization: Bearer <token>`.
- On HTTP 429, read `retryAfterSeconds` or the `Retry-After` header and delay retries.
- Do not embed `CALL_TRACKER_REGISTRATION_SECRET` in a publicly distributed APK. It is a provisioning credential.

## Verification after every deployment

```bash
pm2 status
pm2 logs crm-next --lines 100 --nostream
curl -I https://crm.planle.com/login
curl -sS -o /dev/null -w '%{http_code}\n' https://crm.planle.com/login
```

Expected: `crm-next` is `online`, HTTPS returns 200 or a deliberate redirect, and response headers include CSP, HSTS, `X-Content-Type-Options`, and `X-Frame-Options`.

## Encrypted backup

Install PostgreSQL client tools if `pg_dump` is missing. Then run:

```bash
cd /home/planlecrm/htdocs/crm.planle.com
export BACKUP_PASSPHRASE='use-a-long-unique-secret-kept-outside-this-server'
npm run backup:encrypted
unset BACKUP_PASSPHRASE
```

The encrypted file is written to `~/crm-backups` by default and includes a PostgreSQL dump, `.env`, PM2 configuration, and WhatsApp authentication state when present. Copy every backup to storage outside this VPS. A backup left only on the same VPS is not a real backup.

Test decryption and database restoration quarterly on a separate database:

```bash
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in crm-backup-TIMESTAMP.tar.gz.enc -out backup.tar.gz -pass env:BACKUP_PASSPHRASE
tar -xzf backup.tar.gz -C /a/temporary/restore-directory
pg_restore --clean --if-exists --no-owner --dbname='RESTORE_DATABASE_URL' /a/temporary/restore-directory/database.dump
```

Never restore over production without a fresh backup and a maintenance window.

## Rollback

Keep each uploaded deployment archive until the new release passes verification. To roll back code, extract the previous archive into a new release directory, preserve the current `.env`, run `npm ci && npm run build`, then switch CloudPanel/PM2 to that release. Database migrations are forward-only unless a separately reviewed down migration exists; do not improvise a database rollback.

## Secrets

Rotate `AUTH_SECRET`, `CALL_TRACKER_REGISTRATION_SECRET`, `WHATSAPP_BRIDGE_TOKEN`, admin passwords, and the database password if they were ever pasted into chat, screenshots, shell history, or source control. Rotating `AUTH_SECRET` signs out every user. A password change now invalidates that account's older CRM sessions automatically.