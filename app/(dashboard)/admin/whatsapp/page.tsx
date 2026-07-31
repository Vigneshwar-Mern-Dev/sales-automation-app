export const dynamic = "force-dynamic";

import Image from "next/image";
import Link from "next/link";
import QRCode from "qrcode";
import { db } from "@/app/lib/db";
import {
  getWhatsAppAccounts,
  ensureWhatsAppAccount,
  requestWhatsAppQrAction,
  resumeWhatsAppAction,
  logoutWhatsAppAction,
  pauseWhatsAppAction,
  createWhatsAppAccountAction,
  deleteWhatsAppAccountAction,
} from "@/app/lib/whatsapp-actions";
import { WhatsAppLeadStatus } from "@/app/lib/prisma-enums";
import { WaLivePanel } from "../components/wa-live-panel";

function formatDate(value: Date | null) {
  if (!value) return "Never";
  return value.toLocaleString("en-IN", { day: "2-digit", hour: "2-digit", minute: "2-digit", month: "short" });
}

function statusTone(status: string) {
  const tones: Record<string, string> = {
    CONNECTED: "border-emerald-300/20 bg-emerald-300/10 text-emerald-100",
    QR_REQUIRED: "border-cyan-300/20 bg-cyan-300/10 text-cyan-100",
    CONNECTING: "border-sky-300/20 bg-sky-300/10 text-sky-100",
    PAUSED: "border-amber-300/20 bg-amber-300/10 text-amber-100",
    ERROR: "border-rose-300/20 bg-rose-300/10 text-rose-100",
    DISCONNECTED: "border-white/10 bg-white/5 text-slate-300",
  };
  return tones[status] ?? tones.DISCONNECTED;
}

function leadStatusTone(status: string) {
  const tones: Record<string, string> = {
    OPTED_IN: "border-emerald-300/20 bg-emerald-300/10 text-emerald-100",
    QUEUED: "border-cyan-300/20 bg-cyan-300/10 text-cyan-100",
    SENT: "border-sky-300/20 bg-sky-300/10 text-sky-100",
    REPLIED: "border-violet-300/20 bg-violet-300/10 text-violet-100",
    FAILED: "border-rose-300/20 bg-rose-300/10 text-rose-100",
    DO_NOT_CONTACT: "border-zinc-300/20 bg-zinc-300/10 text-zinc-200",
    NEW: "border-white/10 bg-white/5 text-slate-300",
  };
  return tones[status] ?? tones.NEW;
}

/** Compute a 0-100 risk score. Higher = riskier. */
function computeRiskScore(account: {
  dailySendLimit: number;
  hourlySendLimit: number;
  warmupEnabled: boolean;
  warmupStartDate: Date | null;
  warmupRampPerDay: number;
  contactCooldownDays: number;
  autoPauseThreshold: number;
  messageVariants: string | null;
  minDelaySeconds: number;
  consecutiveFailures: number;
}) {
  let score = 0;
  const reasons: string[] = [];

  // Warmup not enabled for what appears to be a new/unknown start
  if (!account.warmupEnabled) {
    score += 20;
    reasons.push("Warmup mode off - new numbers should warm up gradually");
  }

  // Daily cap too high
  if (account.dailySendLimit > 100) {
    score += 15;
    reasons.push(`Daily cap ${account.dailySendLimit} is high (recommend <= 100)`);
  } else if (account.dailySendLimit > 50) {
    score += 5;
  }

  // Hourly limit too high
  if (account.hourlySendLimit > 15) {
    score += 15;
    reasons.push(`Hourly limit ${account.hourlySendLimit} is high (recommend <= 15)`);
  }

  // Delay too short
  if (account.minDelaySeconds < 60) {
    score += 10;
    reasons.push(`Min delay ${account.minDelaySeconds}s is short (recommend >= 60s)`);
  }

  // No cooldown
  if (account.contactCooldownDays === 0) {
    score += 15;
    reasons.push("No contact cooldown - same person could be messaged every call");
  }

  // Auto-pause threshold too high
  if (account.autoPauseThreshold > 5) {
    score += 10;
    reasons.push(`Auto-pause threshold ${account.autoPauseThreshold} is high (recommend <= 5)`);
  }

  // Few variants
  const variantCount = (account.messageVariants || "")
    .split(/\n\s*---\s*\n/g)
    .filter((v) => v.trim()).length;
  if (variantCount < 2) {
    score += 15;
    reasons.push("Only 1 message variant - more variants reduce pattern detection");
  } else if (variantCount < 3) {
    score += 5;
  }

  // Active consecutive failures
  if (account.consecutiveFailures > 0) {
    score += Math.min(20, account.consecutiveFailures * 5);
    reasons.push(`${account.consecutiveFailures} consecutive send failures detected`);
  }

  return { score: Math.min(100, score), reasons };
}

function effectiveDailyCap(account: {
  dailySendLimit: number;
  warmupEnabled: boolean;
  warmupStartDate: Date | null;
  warmupRampPerDay: number;
}) {
  if (!account.warmupEnabled || !account.warmupStartDate) return account.dailySendLimit;
  const days = Math.max(1, Math.floor((Date.now() - account.warmupStartDate.getTime()) / 86_400_000));
  return Math.min(account.dailySendLimit, days * account.warmupRampPerDay);
}

// Account label colors for visual distinction
const ACCOUNT_COLORS = [
  { border: "border-cyan-400/30", bg: "from-cyan-400/[0.06]", accent: "text-cyan-300", badge: "bg-cyan-400/15 text-cyan-300 border-cyan-400/30" },
  { border: "border-violet-400/30", bg: "from-violet-400/[0.06]", accent: "text-violet-300", badge: "bg-violet-400/15 text-violet-300 border-violet-400/30" },
  { border: "border-amber-400/30", bg: "from-amber-400/[0.06]", accent: "text-amber-300", badge: "bg-amber-400/15 text-amber-300 border-amber-400/30" },
  { border: "border-rose-400/30", bg: "from-rose-400/[0.06]", accent: "text-rose-300", badge: "bg-rose-400/15 text-rose-300 border-rose-400/30" },
];

export default async function AdminWhatsAppPage() {
  // Ensure at least one account exists for backward compatibility
  await ensureWhatsAppAccount();
  const accounts = await getWhatsAppAccounts();

  // Generate QR data URLs for all accounts that need them
  const qrDataUrls = new Map<string, string>();
  for (const account of accounts) {
    if (account.qrCodeData) {
      const dataUrl = await QRCode.toDataURL(account.qrCodeData, { errorCorrectionLevel: "M", margin: 2, scale: 8 });
      qrDataUrls.set(account.id, dataUrl);
    }
  }

  // Global stats
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  const [totalLeads, repliedLeads, failedLeads, recentLeads] = await Promise.all([
    db.whatsAppLead.count({ where: { deletedAt: null, isArchived: false } }),
    db.whatsAppLead.count({ where: { OR: [{ status: WhatsAppLeadStatus.REPLIED }, { lastReplyAt: { not: null } }], deletedAt: null, isArchived: false } }),
    db.whatsAppLead.count({ where: { OR: [{ status: WhatsAppLeadStatus.FAILED }, { queueItems: { some: { status: "FAILED", deletedAt: null, isArchived: false } } }], deletedAt: null, isArchived: false } }),
    db.whatsAppLead.findMany({
      where: { deletedAt: null, isArchived: false },
      orderBy: { updatedAt: "desc" },
      take: 8,
      select: { id: true, displayName: true, phone: true, status: true, lastReplySnippet: true, updatedAt: true },
    }),
  ]);

  // Per-account stats
  const accountStats = await Promise.all(
    accounts.map(async (account) => {
      const [queuedCount, sentToday, sentLastHour] = await Promise.all([
        db.whatsAppQueueItem.count({ where: { accountId: account.id, status: { in: ["QUEUED", "SENDING"] }, deletedAt: null, isArchived: false } }),
        db.whatsAppQueueItem.count({ where: { accountId: account.id, status: "SENT", sentAt: { gte: todayStart }, deletedAt: null } }),
        db.whatsAppQueueItem.count({ where: { accountId: account.id, status: "SENT", sentAt: { gte: oneHourAgo }, deletedAt: null } }),
      ]);
      return { accountId: account.id, queuedCount, sentToday, sentLastHour };
    }),
  );

  const statsMap = new Map(accountStats.map((s) => [s.accountId, s]));
  // eslint-disable-next-line react-hooks/purity
  const nowTimestamp = Date.now();

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <section className="flex flex-col justify-between gap-4 rounded-xl border border-white/10 bg-gradient-to-br from-emerald-300/[0.04] to-transparent p-5 md:flex-row md:items-center">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300">WhatsApp</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-white md:text-4xl">WhatsApp control panel</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            Multi-account routing — capacity, isolation &amp; failover. {accounts.length} account{accounts.length === 1 ? "" : "s"} configured.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <WaLivePanel />
          <form action={createWhatsAppAccountAction}>
            <input name="label" type="hidden" value={`WhatsApp ${accounts.length + 1}`} />
            <button className="h-10 rounded-lg border border-emerald-300/20 bg-emerald-300/10 px-4 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-300/15" type="submit">
              + Add Account
            </button>
          </form>
          <Link className="flex h-10 items-center rounded-lg border border-white/10 bg-white/5 px-4 text-sm font-semibold text-slate-200 transition hover:bg-white/10" href="/admin/whatsapp/settings">
            Settings
          </Link>
        </div>
      </section>

      {/* Account Cards */}
      <section className="grid gap-4 xl:grid-cols-2">
        {accounts.map((account, index) => {
          const colors = ACCOUNT_COLORS[index % ACCOUNT_COLORS.length];
          const stats = statsMap.get(account.id);
          const dailyCap = effectiveDailyCap(account);
          const { score: riskScore, reasons: riskReasons } = computeRiskScore(account);
          const riskLevel = riskScore < 30 ? "low" : riskScore < 60 ? "medium" : "high";
          const isPaused = account.status === "PAUSED" || account.status === "ERROR";
          const qrDataUrl = qrDataUrls.get(account.id);
          const heartbeatFresh = account.lastHeartbeatAt
            ? nowTimestamp - account.lastHeartbeatAt.getTime() < 5 * 60 * 1000
            : false;

          return (
            <div key={account.id} className={`rounded-xl border ${colors.border} bg-gradient-to-br ${colors.bg} to-transparent p-5 space-y-4`}>
              {/* Account Header */}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded border px-2 py-0.5 text-[10px] font-bold ${colors.badge}`}>
                      Account {index + 1}
                    </span>
                    <span className={`rounded-lg border px-3 py-1 text-xs font-bold ${statusTone(account.status)}`}>
                      {account.status.replace("_", " ")}
                    </span>
                    {heartbeatFresh && (
                      <span className="rounded border border-emerald-300/20 bg-emerald-300/10 px-1.5 py-0.5 text-[10px] font-bold text-emerald-200">
                        Worker alive
                      </span>
                    )}
                  </div>
                  <h2 className="mt-2 text-lg font-bold text-white">{account.label}</h2>
                  <p className="text-xs text-slate-500">{account.phoneNumber || "Not connected"}</p>
                  <p className="mt-1 font-mono text-[10px] text-slate-600 select-all">{account.id}</p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <form action={requestWhatsAppQrAction}>
                    <input name="accountId" type="hidden" value={account.id} />
                    <button className="h-8 rounded-md border border-cyan-300/20 bg-cyan-300/10 px-3 text-[11px] font-semibold text-cyan-100 transition hover:bg-cyan-300/15" type="submit">
                      QR
                    </button>
                  </form>
                  {isPaused ? (
                    <form action={resumeWhatsAppAction}>
                      <input name="accountId" type="hidden" value={account.id} />
                      <button className="h-8 rounded-md border border-emerald-300/20 bg-emerald-300/10 px-3 text-[11px] font-semibold text-emerald-100 transition hover:bg-emerald-300/15" type="submit">
                        Resume
                      </button>
                    </form>
                  ) : (
                    <form action={pauseWhatsAppAction}>
                      <input name="accountId" type="hidden" value={account.id} />
                      <button className="h-8 rounded-md border border-white/10 px-3 text-[11px] font-semibold text-slate-300 transition hover:bg-white/10" type="submit">
                        Pause
                      </button>
                    </form>
                  )}
                  <form action={logoutWhatsAppAction}>
                    <input name="accountId" type="hidden" value={account.id} />
                    <button className="h-8 rounded-md border border-rose-300/20 bg-rose-300/10 px-3 text-[11px] font-semibold text-rose-100 transition hover:bg-rose-300/15" type="submit">
                      Logout
                    </button>
                  </form>
                  {accounts.length > 1 && (
                    <form action={deleteWhatsAppAccountAction}>
                      <input name="accountId" type="hidden" value={account.id} />
                      <button className="h-8 rounded-md border border-rose-300/20 px-3 text-[11px] font-semibold text-rose-300/70 transition hover:bg-rose-300/10 hover:text-rose-300" type="submit">
                        Delete
                      </button>
                    </form>
                  )}
                </div>
              </div>

              {/* QR / Connection Panel */}
              <div className="rounded-lg border border-white/10 bg-black/30 p-4">
                {account.status === "CONNECTED" ? (
                  <div className="grid place-items-center rounded-lg border border-emerald-300/20 bg-emerald-950/30 p-6 text-center">
                    <p className="text-base font-bold text-emerald-100">Device Connected</p>
                    <p className="mt-1 text-sm text-emerald-200/70">{account.phoneNumber || "Verified Session"}</p>
                  </div>
                ) : qrDataUrl ? (
                  <div className="space-y-3">
                    <Image
                      alt={`QR code for ${account.label}`}
                      className="mx-auto aspect-square w-full max-w-56 rounded-lg border border-white/10 bg-white p-2"
                      height={224}
                      src={qrDataUrl}
                      unoptimized
                      width={224}
                    />
                    <p className="text-center text-xs text-slate-500">Scan from WhatsApp, then open Linked devices.</p>
                  </div>
                ) : (
                  <div className="grid place-items-center rounded-lg border border-dashed border-white/10 bg-black/20 p-6 text-center">
                    <p className="font-semibold text-white">No QR available</p>
                    <p className="mt-1 text-sm text-slate-400">Start the worker and click QR.</p>
                  </div>
                )}
              </div>

              {/* Stats Row */}
              <div className="grid grid-cols-4 gap-2 text-center text-xs">
                <div className="rounded-lg border border-white/5 bg-black/20 py-2.5">
                  <p className="text-lg font-bold text-white">{stats?.sentToday ?? 0}<span className="text-[11px] font-normal text-slate-500">/{dailyCap}</span></p>
                  <p className="text-slate-500">Sent today</p>
                </div>
                <div className="rounded-lg border border-white/5 bg-black/20 py-2.5">
                  <p className="text-lg font-bold text-white">{stats?.sentLastHour ?? 0}<span className="text-[11px] font-normal text-slate-500">/{account.hourlySendLimit}</span></p>
                  <p className="text-slate-500">Last hour</p>
                </div>
                <div className="rounded-lg border border-white/5 bg-black/20 py-2.5">
                  <p className="text-lg font-bold text-cyan-200">{stats?.queuedCount ?? 0}</p>
                  <p className="text-slate-500">Queued</p>
                </div>
                <div className="rounded-lg border border-white/5 bg-black/20 py-2.5">
                  <p className={`text-lg font-bold ${riskLevel === "low" ? "text-emerald-200" : riskLevel === "medium" ? "text-amber-200" : "text-rose-200"}`}>{riskScore}</p>
                  <p className="text-slate-500">Risk</p>
                </div>
              </div>

              {/* Details */}
              <dl className="grid gap-1.5 text-xs">
                {[
                  ["Last connected", formatDate(account.lastConnectedAt)],
                  ["Delay", `${account.minDelaySeconds}-${account.maxDelaySeconds}s`],
                  ["Cooldown", account.contactCooldownDays > 0 ? `${account.contactCooldownDays} days` : "Off"],
                  ["Auto-reply", account.autoReplyEnabled ? "ON" : "OFF"],
                  ["Warmup", account.warmupEnabled ? `ON (${account.warmupRampPerDay}/day)` : "Off"],
                ].map(([label, value]) => (
                  <div className="flex justify-between gap-4 rounded border border-white/5 bg-black/20 px-3 py-2" key={label}>
                    <dt className="text-slate-500">{label}</dt>
                    <dd className="font-semibold text-slate-200">{value}</dd>
                  </div>
                ))}
                {account.consecutiveFailures > 0 && (
                  <div className="flex justify-between gap-4 rounded border border-rose-300/20 bg-rose-300/10 px-3 py-2">
                    <dt className="text-rose-200">Failures</dt>
                    <dd className="font-bold text-rose-100">{account.consecutiveFailures} / {account.autoPauseThreshold}</dd>
                  </div>
                )}
              </dl>

              {account.lastError && (
                <div className="rounded-lg border border-rose-300/20 bg-rose-300/10 p-3 text-xs text-rose-100">
                  {account.lastError}
                </div>
              )}

              {riskReasons.length > 0 && (
                <ul className="space-y-0.5">
                  {riskReasons.slice(0, 3).map((r) => (
                    <li className="text-[11px] leading-4 text-slate-500" key={r}>⚠ {r}</li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </section>

      {/* Global stats + Recent leads */}
      <section className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
          <h2 className="text-lg font-semibold text-white">Global overview</h2>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
            {[
              ["Total leads", totalLeads, "text-white"],
              ["Replied", repliedLeads, "text-violet-200"],
              ["Failed", failedLeads, "text-rose-200"],
            ].map(([label, value, color]) => (
              <div className="rounded-lg border border-white/5 bg-black/20 py-3" key={String(label)}>
                <p className={`text-lg font-bold ${color}`}>{value}</p>
                <p className="mt-0.5 text-slate-500">{label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold text-white">Recent leads</h2>
            <Link className="rounded-lg border border-white/10 px-3 py-2 text-xs font-bold text-slate-200 transition hover:bg-white/10" href="/admin/whatsapp/leads">
              Manage all
            </Link>
          </div>

          <div className="mt-4 divide-y divide-white/10">
            {recentLeads.map((lead) => (
              <div className="grid gap-2 py-3 text-sm sm:grid-cols-[1fr_auto_auto]" key={lead.id}>
                <div className="min-w-0">
                  <p className="truncate font-semibold text-white">{lead.displayName}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{lead.phone}</p>
                  {lead.lastReplySnippet && (
                    <p className="mt-1 line-clamp-1 text-xs text-violet-300">Reply: {lead.lastReplySnippet}</p>
                  )}
                </div>
                <span className={`h-7 w-fit rounded border px-2 text-xs font-bold leading-7 ${leadStatusTone(lead.status)}`}>
                  {lead.status.replace("_", " ")}
                </span>
                <p className="text-xs text-slate-500 sm:text-right">{formatDate(lead.updatedAt)}</p>
              </div>
            ))}
            {!recentLeads.length && <p className="py-4 text-sm text-slate-500">No WhatsApp leads yet.</p>}
          </div>
        </div>
      </section>

      {/* Worker setup guide */}
      <section className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
        <h2 className="text-lg font-semibold text-white">Running workers</h2>
        <p className="mt-2 text-sm text-slate-400">
          Each account needs its own worker process. Copy the account ID from the card above and set it as <code className="rounded bg-black/40 px-1 text-cyan-100">WHATSAPP_ACCOUNT_ID</code>.
        </p>
        <div className="mt-4 rounded-lg border border-white/10 bg-black/30 p-4 font-mono text-xs leading-6 text-slate-300">
          {accounts.map((account, i) => (
            <div key={account.id} className={i > 0 ? "mt-3 border-t border-white/5 pt-3" : ""}>
              <p className="text-slate-500"># {account.label}</p>
              <p>$env:WHATSAPP_ACCOUNT_ID=&quot;{account.id}&quot;</p>
              <p>$env:WHATSAPP_BRIDGE_TOKEN=&quot;your-token&quot;</p>
              <p>$env:CRM_BASE_URL=&quot;http://localhost:3000&quot;</p>
              <p>npm run whatsapp:worker</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-amber-300/20 bg-amber-300/10 p-4 text-sm leading-6 text-amber-100">
        Multi-account routing distributes capacity and provides failover. It does not reduce the risk of policy violations. Keep opt-in required, use warmup mode for new numbers, and comply with WhatsApp&apos;s terms of service.
      </section>
    </div>
  );
}
