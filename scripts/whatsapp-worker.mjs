import process from "node:process";
import "dotenv/config";
import pkg from "whatsapp-web.js";
import {
  getProviderMessageId,
  phoneFromWhatsAppId,
  toWhatsAppId,
} from "./whatsapp-worker-utils.mjs";
const { Client, LocalAuth } = pkg;

const CRM_BASE_URL = process.env.CRM_BASE_URL || "http://127.0.0.1:3000";
const BRIDGE_TOKEN = process.env.WHATSAPP_BRIDGE_TOKEN;
let ACCOUNT_ID = process.env.WHATSAPP_ACCOUNT_ID || undefined;
const POLL_MS = Number.parseInt(process.env.WHATSAPP_POLL_MS || "10000", 10);
const SEND_TYPING = process.env.WHATSAPP_SEND_TYPING !== "false";

if (!BRIDGE_TOKEN) {
  console.error("WHATSAPP_BRIDGE_TOKEN is required.");
  process.exit(1);
}

if (!ACCOUNT_ID) {
  console.error(
    "WHATSAPP_ACCOUNT_ID is required. Start scripts/whatsapp-worker-manager.mjs " +
      "to supervise all configured accounts.",
  );
  process.exit(1);
}

async function resolveAccountId() {
  if (ACCOUNT_ID) return ACCOUNT_ID;
  try {
    const res = await fetch(`${CRM_BASE_URL}/api/whatsapp/status`, {
      headers: { "x-whatsapp-bridge-token": BRIDGE_TOKEN },
    });
    if (res.ok) {
      const data = await res.json();
      if (data.ok && data.accounts && data.accounts.length > 0) {
        ACCOUNT_ID = data.accounts[0].id;
        console.log(`[worker] Auto-bound to primary account: ${ACCOUNT_ID} (${data.accounts[0].label})`);
        return ACCOUNT_ID;
      }
    }
  } catch (err) {
    console.warn(`[worker] Failed to auto-resolve primary account ID: ${err.message}`);
  }
  return null;
}

// ── Alerting configuration ───────────────────────────────────────────────────

const ALERT_WEBHOOK_URL = process.env.ALERT_WEBHOOK_URL || null;
const ALERT_TELEGRAM_BOT_TOKEN = process.env.ALERT_TELEGRAM_BOT_TOKEN || null;
const ALERT_TELEGRAM_CHAT_ID = process.env.ALERT_TELEGRAM_CHAT_ID || null;
const ALERT_COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes between alerts
const DISCONNECT_ALERT_THRESHOLD_MS = 15 * 60 * 1000; // Alert after 15 min disconnected

let lastAlertSentAt = 0;
let disconnectedSince = null; // timestamp when disconnect started
let disconnectAlertTimerId = null;

function alertingEnabled() {
  return Boolean(ALERT_WEBHOOK_URL || (ALERT_TELEGRAM_BOT_TOKEN && ALERT_TELEGRAM_CHAT_ID));
}

async function sendAlert(subject, body) {
  if (!alertingEnabled()) return;

  const now = Date.now();
  if (now - lastAlertSentAt < ALERT_COOLDOWN_MS) {
    console.log(`[alert] Cooldown active, skipping alert: ${subject}`);
    return;
  }

  lastAlertSentAt = now;
  const message = `🚨 MAKT CRM WhatsApp Worker\n\n${subject}\n\n${body}\n\nTime: ${new Date().toISOString()}`;

  // Try Telegram first if configured
  if (ALERT_TELEGRAM_BOT_TOKEN && ALERT_TELEGRAM_CHAT_ID) {
    try {
      const url = `https://api.telegram.org/bot${ALERT_TELEGRAM_BOT_TOKEN}/sendMessage`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: ALERT_TELEGRAM_CHAT_ID, text: message, parse_mode: "HTML" }),
      });
      if (res.ok) {
        console.log("[alert] Telegram alert sent successfully.");
        return;
      }
      console.warn(`[alert] Telegram alert failed: HTTP ${res.status}`);
    } catch (err) {
      console.warn("[alert] Telegram alert error:", err.message || err);
    }
  }

  // Fallback to generic webhook
  if (ALERT_WEBHOOK_URL) {
    try {
      const res = await fetch(ALERT_WEBHOOK_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subject, body, timestamp: new Date().toISOString(), source: "whatsapp-worker" }),
      });
      if (res.ok) {
        console.log("[alert] Webhook alert sent successfully.");
      } else {
        console.warn(`[alert] Webhook alert failed: HTTP ${res.status}`);
      }
    } catch (err) {
      console.warn("[alert] Webhook alert error:", err.message || err);
    }
  }
}

function startDisconnectAlertTimer(reason) {
  clearDisconnectAlertTimer();
  disconnectedSince = Date.now();
  disconnectAlertTimerId = setTimeout(async () => {
    const minutesDown = Math.round((Date.now() - disconnectedSince) / 60000);
    console.error(`[alert] WhatsApp has been disconnected for ${minutesDown} minutes.`);
    await sendAlert(
      "WhatsApp Disconnected",
      `Worker has been disconnected for ${minutesDown}+ minutes.\nReason: ${reason}\nAction required: Check the WhatsApp admin panel and re-scan QR if needed.`,
    );
  }, DISCONNECT_ALERT_THRESHOLD_MS);
}

function clearDisconnectAlertTimer() {
  if (disconnectAlertTimerId) {
    clearTimeout(disconnectAlertTimerId);
    disconnectAlertTimerId = null;
  }
  disconnectedSince = null;
}

// ── Utility functions ────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTimeout(promise, timeoutMs, errorMsg = "Operation timed out") {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(errorMsg)), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
}

// ── Error classification ─────────────────────────────────────────────────────
// Classify errors to distinguish data issues from actual delivery failures.
// Data issues (e.g. unregistered number) should NOT trigger auto-pause.

const INVALID_NUMBER_PATTERNS = [
  "is not registered on whatsapp",
  "invalid phone",
  "invalid number",
  "not a valid whatsapp",
  "no lid for user",
  "wid is invalid",
];

function classifyError(errorMessage) {
  const lower = (errorMessage || "").toLowerCase();
  for (const pattern of INVALID_NUMBER_PATTERNS) {
    if (lower.includes(pattern)) {
      return "INVALID_NUMBER";
    }
  }
  return "DELIVERY_FAILURE";
}

// ── Bridge & API communication ───────────────────────────────────────────────

async function postBridge(payload) {
  const response = await fetch(`${CRM_BASE_URL}/api/whatsapp/bridge`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-whatsapp-bridge-token": BRIDGE_TOKEN,
    },
    body: JSON.stringify({ accountId: ACCOUNT_ID, ...payload }),
  });

  if (!response.ok) {
    throw new Error(`Bridge update failed: ${response.status}`);
  }
}

async function getOutboxLead() {
  const response = await fetch(`${CRM_BASE_URL}/api/whatsapp/outbox?accountId=${encodeURIComponent(ACCOUNT_ID)}`, {
    headers: { "x-whatsapp-bridge-token": BRIDGE_TOKEN },
  });

  if (!response.ok) {
    throw new Error(`Outbox fetch failed: ${response.status}`);
  }

  return response.json();
}

async function postOutboxResult(
  leadId,
  ok,
  error = null,
  errorType = null,
  providerMessageId = null,
) {
  const response = await fetch(`${CRM_BASE_URL}/api/whatsapp/outbox`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-whatsapp-bridge-token": BRIDGE_TOKEN,
    },
    body: JSON.stringify({ leadId, ok, error, errorType, providerMessageId }),
  });

  if (!response.ok) {
    throw new Error(`Outbox result failed: ${response.status}`);
  }
}

async function reportOutboxResultWithRetry(
  leadId,
  ok,
  error = null,
  errorType = null,
  providerMessageId = null,
) {
  let lastError = null;

  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      await postOutboxResult(leadId, ok, error, errorType, providerMessageId);
      return;
    } catch (resultError) {
      lastError = resultError;
      console.warn(
        `[outbox] Result callback attempt ${attempt}/5 failed for ${leadId}: ${resultError.message || resultError}`,
      );
      if (attempt < 5) {
        await sleep(attempt * 2000);
      }
    }
  }

  throw lastError || new Error("Outbox result callback failed.");
}

async function postInboxReply(phone, message) {
  try {
    const response = await fetch(`${CRM_BASE_URL}/api/whatsapp/inbox`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-whatsapp-bridge-token": BRIDGE_TOKEN,
      },
      body: JSON.stringify({ phone, message, receivedAt: new Date().toISOString() }),
    });

    if (!response.ok) {
      console.warn(`[inbox] Failed to post reply for ${phone}: ${response.status}`);
    }
  } catch (err) {
    console.error("[inbox] Error posting reply:", err);
  }
}

// ── Phone number helpers ─────────────────────────────────────────────────────

  // "919876543210@c.us" → "+919876543210"

// ── WhatsApp client setup ────────────────────────────────────────────────────

async function resolveIncomingPhone(msg) {
  const rawId = msg.author || msg.from;
  const directPhone = phoneFromWhatsAppId(rawId);
  if (directPhone) return directPhone;

  try {
    const contact = await withTimeout(msg.getContact(), 15000, "Incoming contact lookup timed out");
    const contactPhone =
      phoneFromWhatsAppId(contact?.id?._serialized) ||
      phoneFromWhatsAppId(contact?.number ? `${contact.number}@c.us` : null);
    if (contactPhone) return contactPhone;
  } catch (error) {
    console.warn(`[inbox] Contact lookup failed for ${rawId}:`, error.message || error);
  }

  try {
    const mappings = await withTimeout(
      client.getContactLidAndPhone([rawId]),
      15000,
      "Incoming LID lookup timed out",
    );
    return phoneFromWhatsAppId(mappings?.[0]?.pn);
  } catch (error) {
    console.warn(`[inbox] LID lookup failed for ${rawId}:`, error.message || error);
    return null;
  }
}

let AUTH_DATA_PATH = null;
let client = null;

function createClient() {
  if (!ACCOUNT_ID) {
    throw new Error("Cannot initialize WhatsApp before resolving an account ID.");
  }

  AUTH_DATA_PATH = `.whatsapp-auth-${ACCOUNT_ID}`;

  return new Client({
    authStrategy: new LocalAuth({
      clientId: ACCOUNT_ID,
      dataPath: AUTH_DATA_PATH,
    }),
    puppeteer: {
      headless: process.env.WHATSAPP_HEADLESS !== "false",
      protocolTimeout: 300000, // 5 minutes
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--no-zygote",
        "--disable-extensions",
      ],
    },
  });
}

let ready = false;
let sending = false;
let isShuttingDown = false;

// ── Reconnection with exponential backoff ────────────────────────────────────

let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
let reconnecting = false;

function getBackoffDelay(attempt) {
  // Exponential: 10s → 20s → 40s → 60s → 120s (capped)
  const delays = [10_000, 20_000, 40_000, 60_000, 120_000];
  return delays[Math.min(attempt - 1, delays.length - 1)] || 120_000;
}

async function handleReconnect(reason = "Connection lost") {
  if (reconnecting || isShuttingDown) return;
  reconnecting = true;
  ready = false;

  reconnectAttempts++;
  const backoffMs = getBackoffDelay(reconnectAttempts);
  console.log(`[worker] Attempting reconnection (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}) in ${backoffMs / 1000}s... Reason: ${reason}`);

  if (reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
    console.error("[worker] Max reconnection attempts reached. Pausing worker.");
    await postBridge({ status: "ERROR", lastError: "Max reconnection attempts reached. Please scan QR or click Resume." }).catch(() => {});
    reconnecting = false;
    return;
  }

  await postBridge({ status: "CONNECTING", lastError: `Reconnecting (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...` }).catch(() => {});

  setTimeout(async () => {
    let initializingClient = null;
    try {
      console.log("[worker] Destroying client...");
      clearInitTimeout();
      const previousClient = client;
      await previousClient?.destroy().catch(() => {});

      // If it was an authentication failure, clear the auth directory to force a clean login/QR
      if (reason.toLowerCase().includes("auth")) {
        console.log("[worker] Clearing auth session directory due to auth failure...");
        const fs = await import("fs");
        if (fs.existsSync(AUTH_DATA_PATH)) {
          fs.rmSync(AUTH_DATA_PATH, { recursive: true, force: true });
        }
      }

      console.log("[worker] Re-initializing client...");
      initializingClient = createClient();
      client = initializingClient;
      registerClientEventHandlers(initializingClient);
      startInitTimeout();
      await initializingClient.initialize();
      // Note: `reconnecting` will be cleared when `ready` event fires (sets reconnecting = false)
      // If init succeeds but `ready` never fires, the init timeout (below) will catch it
    } catch (err) {
      if (initializingClient && initializingClient !== client) return;
      console.error("[worker] Reconnection initialization failed:", err);
      reconnecting = false;
      // Schedule next attempt (recursive, uses backoff)
      handleReconnect(reason);
    }
  }, backoffMs);
}

// ── Initialization timeout ──────────────────────────────────────────────────
// If `ready` event doesn't fire within 120s of initialize(), force a reconnect

let initTimeoutId = null;
const INIT_TIMEOUT_MS = 120_000; // 2 minutes

function startInitTimeout() {
  clearInitTimeout();
  initTimeoutId = setTimeout(() => {
    if (!ready && !isShuttingDown) {
      console.error("[worker] Initialization timed out after 120s. Forcing reconnect.");
      reconnecting = false;
      handleReconnect("Initialization timeout — ready event never fired");
    }
  }, INIT_TIMEOUT_MS);
}

function clearInitTimeout() {
  if (initTimeoutId) {
    clearTimeout(initTimeoutId);
    initTimeoutId = null;
  }
}

// ── Periodic health check ────────────────────────────────────────────────────
// Every 60s, verify the client is still alive. If not, trigger reconnect.

let healthCheckIntervalId = null;

function startHealthCheck() {
  stopHealthCheck();
  healthCheckIntervalId = setInterval(async () => {
    if (!ready || isShuttingDown || reconnecting) return;

    try {
      // Attempt to access client info — if the underlying page/browser crashed,
      // this will throw or return null
      const info = client.info;
      if (!info) {
        console.warn("[health] client.info is null despite ready=true. Triggering reconnect.");
        handleReconnect("Health check: client.info is null");
        return;
      }

      // Also ping the bridge to keep the server aware we're alive
      await postBridge({
        heartbeatOnly: true,
        phoneNumber: info?.wid?.user || null,
      }).catch(() => {});
    } catch (err) {
      console.error("[health] Health check failed:", err.message || err);
      handleReconnect("Health check failed: " + (err.message || "Unknown error"));
    }
  }, 60_000); // every 60 seconds
}

function stopHealthCheck() {
  if (healthCheckIntervalId) {
    clearInterval(healthCheckIntervalId);
    healthCheckIntervalId = null;
  }
}

// ── WhatsApp event handlers ──────────────────────────────────────────────────

function registerClientEventHandlers(eventClient) {
eventClient.on("qr", async (qr) => {
  if (eventClient !== client) return;
  ready = false;
  console.log("QR received. Open /admin/whatsapp and scan it.");
  await postBridge({ status: "QR_REQUIRED", qrCodeData: qr, lastError: null });
});

eventClient.on("authenticated", async () => {
  if (eventClient !== client) return;
  console.log("WhatsApp authenticated.");
  await postBridge({ status: "CONNECTING", qrCodeData: null, lastError: null });
});

eventClient.on("ready", async () => {
  if (eventClient !== client) return;
  ready = true;
  reconnectAttempts = 0; // Reset reconnection attempts on successful connection
  reconnecting = false;
  clearInitTimeout();
  clearDisconnectAlertTimer();
  const info = eventClient.info;
  console.log("WhatsApp ready.");
  await postBridge({
    status: "CONNECTED",
    phoneNumber: info?.wid?.user || null,
    qrCodeData: null,
    lastError: null,
  });
  startHealthCheck();
});

eventClient.on("disconnected", async (reason) => {
  if (eventClient !== client) return;
  ready = false;
  stopHealthCheck();
  console.error("WhatsApp disconnected:", reason);
  await postBridge({ status: "DISCONNECTED", lastError: String(reason || "") }).catch(() => {});
  startDisconnectAlertTimer(String(reason || "Unknown"));
  if (!isShuttingDown) {
    handleReconnect(String(reason || "Disconnected"));
  }
});

eventClient.on("auth_failure", async (msg) => {
  if (eventClient !== client) return;
  console.error("WhatsApp authentication failure:", msg);
  stopHealthCheck();
  await postBridge({ status: "ERROR", lastError: "Auth failure: " + String(msg) }).catch(() => {});
  await sendAlert("WhatsApp Auth Failure", `Authentication failed: ${String(msg)}\nWorker will attempt reconnection.`);
  handleReconnect("Authentication failure: " + String(msg));
});

// ── Incoming message listener (reply detection) ──────────────────────────────
eventClient.on("message", async (msg) => {
  if (eventClient !== client) return;
  // Ignore: outgoing, status updates, group messages, broadcasts
  if (msg.fromMe) return;
  if (msg.isStatus) return;
  if (msg.from.endsWith("@g.us")) return;  // group
  if (msg.from.endsWith("@broadcast")) return;

  const phone = await resolveIncomingPhone(msg);

  if (!phone) {
    console.warn(`[inbox] Ignoring message because ${msg.from} could not be resolved to a phone number.`);
    return;
  }

  console.log(`[inbox] Received reply from ${phone}: "${msg.body?.slice(0, 60)}"`);
  await postInboxReply(phone, msg.body || "");
});
}

// ── Outbound sending loop ────────────────────────────────────────────────────
async function sendNextLead() {
  if (!ready || sending || isShuttingDown) return;

  sending = true;
  let currentLeadId = null;
  let messageDelivered = false;
  let providerMessageId = null;

  try {
    const outbox = await getOutboxLead();

    if (!outbox.ok) return;

    if (outbox.logoutRequested || outbox.qrRequested) {
      console.log(`[worker:${ACCOUNT_ID || "primary"}] ${outbox.qrRequested ? "QR request" : "Logout request"} received. Resetting session auth for new QR...`);
      await postBridge({ status: "QR_REQUIRED", qrCodeData: null, lastError: null }).catch(() => {});
      try {
        await client.logout();
      } catch {}
      try {
        await client.destroy();
      } catch {}
      const fs = await import("fs");
      fs.rmSync(AUTH_DATA_PATH, { recursive: true, force: true });
      process.exit(0);
    }

    // Paused, daily capped, or hourly rate-limited — wait quietly
    if (outbox.paused || outbox.capped || outbox.rateLimited || !outbox.lead) {
      if (outbox.rateLimited) {
        console.log(
          `[outbox] Hourly limit reached (${outbox.sentLastHour}/${outbox.hourlyLimit}). Waiting.`,
        );
      }
      return;
    }

    currentLeadId = outbox.lead.id;

    const chatId = toWhatsAppId(outbox.lead.phone);

    // Resolve the canonical WhatsApp ID before sending. A lookup error is
    // temporary and must not be misclassified as an unregistered number.
    let registeredId = null;
    let lastRegistrationError = null;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        registeredId = await withTimeout(
          client.getNumberId(chatId),
          30000,
          "Registration check timed out",
        );
        if (registeredId) break;
      } catch (regErr) {
        lastRegistrationError = regErr;
        console.warn(
          `[worker] Registration check ${attempt}/3 failed for ${chatId}:`,
          regErr.message || regErr,
        );
      }

      if (attempt < 3) {
        await sleep(attempt * 1500);
      }
    }

    if (!registeredId && lastRegistrationError) {
      console.warn(
        `[worker] Registration lookup was unavailable for ${outbox.lead.phone}; attempting delivery with the normalized chat ID.`,
      );
    } else if (!registeredId) {
      console.warn(
        `[worker] Registration lookup returned no ID for ${outbox.lead.phone}; attempting delivery instead of rejecting the number.`,
      );
    }

    // The lookup is not authoritative. sendMessage provides the real delivery
    // result and avoids falsely labelling valid numbers as unregistered.
    const resolvedChatId = registeredId?._serialized || chatId;
    console.log(
      `[outbox] Sending ${outbox.lead.id} to ${outbox.lead.phone} using ${resolvedChatId}.`,
    );

    let chat = null;
    try {
      chat = await withTimeout(client.getChatById(resolvedChatId), 30000, "Get chat timed out");
    } catch (chatErr) {
      console.warn(`[worker] Could not get chat for ${resolvedChatId} (likely new contact):`, chatErr.message || chatErr);
    }

    if (SEND_TYPING && chat) {
      try {
        await withTimeout(chat.sendStateTyping(), 10000, "sendStateTyping timed out");
        await sleep(Math.min(5000, Math.max(1500, outbox.lead.message.length * 35)));
      } catch (typingErr) {
        console.warn("[worker] sendStateTyping failed (ignoring):", typingErr.message);
      }
      try {
        await withTimeout(chat.clearState(), 10000, "clearState timed out");
      } catch (clearErr) {
        console.warn("[worker] clearState failed (ignoring):", clearErr.message);
      }
    }

    const sentMessage = await withTimeout(
      client.sendMessage(resolvedChatId, outbox.lead.message, { waitUntilMsgSent: true }),
      60000,
      "sendMessage timed out",
    );
    // whatsapp-web.js can finish waitUntilMsgSent successfully but return
    // undefined when the just-sent message is missing from its local cache.
    // The resolved send promise is the delivery result; the provider ID is
    // useful metadata, not a second success condition.
    providerMessageId = getProviderMessageId(sentMessage);
    messageDelivered = true;
    await reportOutboxResultWithRetry(
      outbox.lead.id,
      true,
      null,
      null,
      providerMessageId,
    );
    console.log(
      providerMessageId
        ? `Sent WhatsApp message to ${outbox.lead.phone}; provider ID ${providerMessageId}.`
        : `Sent WhatsApp message to ${outbox.lead.phone}; provider ID was unavailable from the local cache.`,
    );
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Unknown worker error";
    const errorType = classifyError(message);

    // If the error happened during/after lead pickup, mark it FAILED
    // so it doesn't stay stuck in QUEUED indefinitely.
    if (currentLeadId) {
      if (messageDelivered) {
        console.error(
          `[outbox] Message was delivered but confirmation failed for ${currentLeadId}; refusing to mark it FAILED.`,
        );
        await postBridge({
          status: "ERROR",
          lastError: `Delivery confirmation failed for queue item ${currentLeadId}.`,
        }).catch(() => {});
      } else {
        await reportOutboxResultWithRetry(
          currentLeadId,
          false,
          message,
          errorType,
        ).catch(() => {});
      }
    } else {
      // Pre-lead error (e.g. outbox fetch failed) — report bridge status only
      await postBridge({ status: "ERROR", lastError: message }).catch(() => {});
    }
  } finally {
    sending = false;
  }
}

setInterval(() => {
  sendNextLead().catch((error) => console.error(error));
}, Math.max(5000, POLL_MS));

// ── Graceful shutdown handlers ───────────────────────────────────────────────

async function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`[worker] Received ${signal}. Shutting down gracefully...`);

  stopHealthCheck();
  clearInitTimeout();
  clearDisconnectAlertTimer();

  const sendDeadline = Date.now() + 150_000;
  while (sending && Date.now() < sendDeadline) {
    console.log("[worker] Waiting for the active delivery to finish before shutdown...");
    await sleep(1000);
  }

  try {
    await postBridge({ status: "DISCONNECTED" }).catch(() => {});
  } catch {}

  try {
    await client.destroy();
  } catch {}

  console.log(`[worker] Shutdown complete.`);
  process.exit(0);
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

// ── Process-level crash guards ───────────────────────────────────────────────

process.on("unhandledRejection", async (reason) => {
  console.error("[worker] Unhandled promise rejection:", reason);
  // Don't exit — log it and let the worker continue.
  // Only critical unhandled rejections from Puppeteer internals arrive here.
  // The worker's try/catch in sendNextLead handles business-level errors.
  await postBridge({ status: "ERROR", lastError: `Unhandled rejection: ${String(reason)}` }).catch(() => {});
});

process.on("uncaughtException", async (err) => {
  console.error("[worker] Uncaught exception:", err);
  // For uncaught exceptions, we MUST exit — the process state is unreliable.
  // Report status before dying so the UI doesn't show stale "CONNECTED".
  try {
    await postBridge({ status: "ERROR", lastError: `Crash: ${err.message}` });
    await sendAlert("WhatsApp Worker CRASH", `Uncaught exception: ${err.message}\nThe worker process is exiting. PM2 should restart it automatically.`);
  } catch {}
  process.exit(1);
});

// ── Startup ──────────────────────────────────────────────────────────────────

console.log(`[worker:${ACCOUNT_ID || "primary"}] Starting WhatsApp worker for ${CRM_BASE_URL}... Waiting for server to be ready.`);

(async () => {
  // Wait for the Next.js server to be fully up before starting WhatsApp
  while (true) {
    try {
      if (!ACCOUNT_ID) {
        await resolveAccountId();
      }
      if (!ACCOUNT_ID) {
        console.warn("[worker] Waiting for a WhatsApp account to exist in the database...");
        await sleep(3000);
        continue;
      }
      await postBridge({ status: "CONNECTING", lastError: null });
      break; // Success! Server is up.
    } catch (error) {
      const isConnRefused = error.cause && error.cause.code === 'ECONNREFUSED';
      const isHttpError = error.message && /Bridge update failed: \d+/.test(error.message);
      if (isConnRefused || isHttpError) {
        // Server not ready yet (refused or returning errors like 502), retry silently
        await sleep(isConnRefused ? 1000 : 2000);
      } else {
        console.error("Bridge ping failed:", error);
        await sleep(2000);
      }
    }
  }

  console.log("Server is ready. Initializing WhatsApp client...");
  const initialClient = createClient();
  client = initialClient;
  registerClientEventHandlers(initialClient);
  startInitTimeout(); // Start the 120s init watchdog
  try {
    await initialClient.initialize();
  } catch (error) {
    if (initialClient !== client) return;
    clearInitTimeout();
    console.error("[worker] Initial client initialization failed:", error);
    reconnecting = false;
    await handleReconnect("Initial client initialization failed");
  }
})();
