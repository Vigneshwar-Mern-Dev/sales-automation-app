import process from "node:process";
import { spawn } from "node:child_process";
import {
  closeSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import "dotenv/config";
import { shouldRestartStaleWorker } from "./whatsapp-worker-manager-utils.mjs";

const CRM_BASE_URL = process.env.CRM_BASE_URL || "http://127.0.0.1:3000";
const BRIDGE_TOKEN = process.env.WHATSAPP_BRIDGE_TOKEN;
const SYNC_MS = Math.max(3000, Number.parseInt(process.env.WHATSAPP_MANAGER_SYNC_MS || "5000", 10));
const RESTART_DELAY_MS = Math.max(1000, Number.parseInt(process.env.WHATSAPP_WORKER_RESTART_MS || "5000", 10));
const CHECK_ONLY = process.argv.includes("--check");
const LOCK_PATH = path.resolve(process.cwd(), ".whatsapp-worker-manager.lock");

if (!BRIDGE_TOKEN) {
  console.error("[worker-manager] WHATSAPP_BRIDGE_TOKEN is required.");
  process.exit(1);
}

const workers = new Map();
const restartNotBefore = new Map();
let shuttingDown = false;
let syncing = false;
let lockHeld = false;

function isProcessRunning(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

function readLockOwner() {
  try {
    return JSON.parse(readFileSync(LOCK_PATH, "utf8"));
  } catch {
    return null;
  }
}

function acquireManagerLock() {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const descriptor = openSync(LOCK_PATH, "wx");
      try {
        writeFileSync(
          descriptor,
          JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }),
          "utf8",
        );
      } finally {
        closeSync(descriptor);
      }
      lockHeld = true;
      return true;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;

      const owner = readLockOwner();
      if (isProcessRunning(owner?.pid)) {
        console.error(
          `[worker-manager] Another WhatsApp manager is already running (PID ${owner.pid}). ` +
            "Use the existing manager or stop it before starting npm run dev again.",
        );
        return false;
      }

      try {
        unlinkSync(LOCK_PATH);
        console.warn("[worker-manager] Removed stale manager lock.");
      } catch (unlinkError) {
        if (unlinkError?.code !== "ENOENT") throw unlinkError;
      }
    }
  }

  return false;
}

function releaseManagerLock() {
  if (!lockHeld) return;
  const owner = readLockOwner();
  if (owner?.pid === process.pid) {
    try {
      unlinkSync(LOCK_PATH);
    } catch (error) {
      if (error?.code !== "ENOENT") {
        console.warn("[worker-manager] Failed to remove manager lock:", error);
      }
    }
  }
  lockHeld = false;
}

function startWorker(account) {
  if (shuttingDown || workers.has(account.id)) return;
  const notBefore = restartNotBefore.get(account.id) ?? 0;
  if (Date.now() < notBefore) return;
  restartNotBefore.delete(account.id);
  console.log("[worker-manager] Starting worker for " + account.label + " (" + account.id + ").");

  const child = spawn(process.execPath, ["scripts/whatsapp-worker.mjs"], {
    cwd: process.cwd(),
    env: { ...process.env, WHATSAPP_ACCOUNT_ID: account.id, CRM_BASE_URL },
    stdio: "inherit",
    windowsHide: true,
  });

  workers.set(account.id, { child, label: account.label, startedAt: Date.now() });
  child.on("exit", (code, signal) => {
    const current = workers.get(account.id);
    if (current?.child === child) workers.delete(account.id);
    if (!shuttingDown) {
      restartNotBefore.set(account.id, Date.now() + RESTART_DELAY_MS);
      console.warn(
        "[worker-manager] Worker for " + account.label + " exited (code=" +
          code + ", signal=" + signal + "). Restarting after " + RESTART_DELAY_MS + "ms.",
      );
      setTimeout(() => syncWorkers().catch(reportSyncError), RESTART_DELAY_MS);
    }
  });
}

function stopWorker(accountId, reason, restart = false) {
  const entry = workers.get(accountId);
  if (!entry) return;
  workers.delete(accountId);
  if (restart) restartNotBefore.set(accountId, Date.now() + RESTART_DELAY_MS);
  else restartNotBefore.delete(accountId);
  console.log("[worker-manager] Stopping worker for " + entry.label + ": " + reason + ".");
  entry.child.kill("SIGTERM");
}

async function fetchAccounts() {
  const response = await fetch(CRM_BASE_URL + "/api/whatsapp/status", {
    headers: { "x-whatsapp-bridge-token": BRIDGE_TOKEN },
  });
  if (!response.ok) throw new Error("Status request failed with HTTP " + response.status);

  const payload = await response.json();
  if (!payload.ok || !Array.isArray(payload.accounts)) {
    throw new Error("Status response did not include an account list.");
  }
  return payload.accounts;
}

async function syncWorkers() {
  if (syncing || shuttingDown) return;
  syncing = true;
  try {
    const accounts = await fetchAccounts();
    const accountIds = new Set(accounts.map((account) => account.id));
    for (const accountId of workers.keys()) {
      if (!accountIds.has(accountId)) stopWorker(accountId, "account removed");
    }
    for (const account of accounts) {
      const entry = workers.get(account.id);
      if (
        entry &&
        shouldRestartStaleWorker(account, entry.startedAt)
      ) {
        stopWorker(account.id, "connected account heartbeat is stale", true);
      }
    }
    for (const account of accounts) startWorker(account);
  } finally {
    syncing = false;
  }
}

function reportSyncError(error) {
  const message = error instanceof Error ? error.message : String(error);
  console.warn("[worker-manager] Waiting for CRM account list: " + message);
}

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log("[worker-manager] Received " + signal + ". Stopping all workers.");

  const children = [...workers.values()].map((entry) => entry.child);
  workers.clear();
  for (const child of children) child.kill("SIGTERM");
  await Promise.all(children.map((child) => new Promise((resolve) => {
    if (child.exitCode !== null) return resolve();
    child.once("exit", resolve);
    setTimeout(resolve, 15_000);
  })));
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("exit", releaseManagerLock);

if (CHECK_ONLY) {
  fetchAccounts()
    .then((accounts) => {
      console.log(
        "[worker-manager] Check passed: " + accounts.length +
          " account(s) would receive one dedicated worker each.",
      );
    })
    .catch((error) => {
      console.error("[worker-manager] Check failed:", error);
      process.exitCode = 1;
    });
} else {
  if (!acquireManagerLock()) process.exit(1);
  console.log("[worker-manager] Supervising one WhatsApp worker per CRM account.");
  syncWorkers().catch(reportSyncError);
  setInterval(() => syncWorkers().catch(reportSyncError), SYNC_MS);
}
