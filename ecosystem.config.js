require("dotenv").config();

const apps = [
  {
    name: "crm-next",
    cwd: __dirname,
    script: "node_modules/next/dist/bin/next",
    args: "start -p 3000",
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: "1536M",
    exp_backoff_restart_delay: 2000,
    min_uptime: 10000,
    max_restarts: 50,
    time: true,
    env: {
      NODE_ENV: "production",
      NODE_OPTIONS: "--max-old-space-size=1536",
    },
  },
];

if (process.env.WHATSAPP_WORKER_ENABLED === "true") {
  // Account 1 Worker
  apps.push({
    name: "crm-whatsapp-worker-1",
    cwd: __dirname,
    script: "scripts/whatsapp-worker.mjs",
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: "1536M",
    exp_backoff_restart_delay: 5000,
    kill_timeout: 180000,
    min_uptime: 30000,
    max_restarts: 50,
    time: true,
    env: {
      NODE_ENV: "production",
      WHATSAPP_HEADLESS: "true",
      WHATSAPP_ACCOUNT_ID: "cm5y9ygs0001ja3ggjxlovia",
    },
  });

  // Account 2 Worker
  apps.push({
    name: "crm-whatsapp-worker-2",
    cwd: __dirname,
    script: "scripts/whatsapp-worker.mjs",
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: "1536M",
    exp_backoff_restart_delay: 5000,
    kill_timeout: 180000,
    min_uptime: 30000,
    max_restarts: 50,
    time: true,
    env: {
      NODE_ENV: "production",
      WHATSAPP_HEADLESS: "true",
      WHATSAPP_ACCOUNT_ID: "cm6k7z1g00001aued1qnakn7",
    },
  });
}

module.exports = { apps };