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
      CRM_PUBLIC_URL: "https://crm.planle.com",
      NEXT_PUBLIC_CRM_URL: "https://crm.planle.com",
    },
  },
];

if (process.env.WHATSAPP_WORKER_ENABLED === "true") {
  apps.push({
    name: "crm-whatsapp-workers",
    cwd: __dirname,
    script: "scripts/whatsapp-worker-manager.mjs",
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
      CRM_PUBLIC_URL: "https://crm.planle.com",
      NEXT_PUBLIC_CRM_URL: "https://crm.planle.com",
    },
  });
}

module.exports = { apps };
