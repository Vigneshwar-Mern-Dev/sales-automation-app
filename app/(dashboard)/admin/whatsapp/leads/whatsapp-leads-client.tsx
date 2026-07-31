"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { WhatsAppLeadStatus } from "@/app/lib/prisma-enums";
import {
  retryFailedLeadsAction,
  deleteWhatsAppLeadAction,
  manualQueueWhatsAppForCallLeadAction,
  deleteCallLeadDirectAction,
  retryWhatsAppLeadAction,
  bulkCleanupNonSubmittedLeadsAction,
  type RetryFailedLeadsResult,
  type BulkCleanupResult,
} from "@/app/lib/whatsapp-actions";
import { LiveCountdown } from "@/app/(dashboard)/components/live-countdown";


type QueueItem = {
  id: string;
  status: string;
  formToken: string;
  queuedAt: Date | string;
  sendAfterAt: Date | string;
  sendingAt: Date | string | null;
  sentAt: Date | string | null;
  failedAt: Date | string | null;
  lastError: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

type FormSubmission = {
  id: string;
  status: string;
  formToken: string;
  submittedAt: Date | string | null;
  name: string | null;
  city: string | null;
  propertyType: string | null;
  mapsLocation: string | null;
};

type Lead = {
  id: string;
  displayName: string;
  phone: string;
  message: string | null;
  status: WhatsAppLeadStatus;
  lastSentAt: Date | string | null;
  lastReplyAt: Date | string | null;
  lastReplySnippet: string | null;
  lastError: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  formToken: string | null;
  publicFormUrl: string | null;
  formSubmittedAt: Date | string | null;
  formName: string | null;
  formCity: string | null;
  formPropertyType: string | null;
  formMapsLocation: string | null;
  queueItems: QueueItem[];
  latestQueueItem: QueueItem | null;
  formSubmissions: FormSubmission[];
  formSubmission: FormSubmission | null;
  hasSubmittedForm: boolean;
  lifecycleStatus: string;
  accountLabel?: string | null;
  retryEligibility: { retryable: boolean; reasons: string[] };
  targetTime: string | null;
};

type RetryPreview = Pick<RetryFailedLeadsResult, "totalFailed" | "retryable" | "skipped" | "skippedRows">;

type TabCounts = {
  all: number;
  queue: number;
  awaiting: number;
  failed: number;
  replied: number;
  submitted: number;
};

function formatDate(value: Date | string | null) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString("en-IN", { day: "2-digit", hour: "2-digit", minute: "2-digit", month: "short" });
}

function statusTone(status: string) {
  const tones: Record<string, string> = {
    OPTED_IN: "border-emerald-300/20 bg-emerald-300/10 text-emerald-100",
    QUEUED: "border-cyan-300/20 bg-cyan-300/10 text-cyan-100",
    SENDING: "border-cyan-300/20 bg-cyan-300/10 text-cyan-100",
    SENT: "border-sky-300/20 bg-sky-300/10 text-sky-100",
    OPENED: "border-sky-300/20 bg-sky-300/10 text-sky-100",
    FORM_STARTED: "border-amber-300/20 bg-amber-300/10 text-amber-100",
    FORM_SUBMITTED: "border-emerald-300/20 bg-emerald-300/10 text-emerald-100",
    REPLIED: "border-violet-300/20 bg-violet-300/10 text-violet-100",
    FAILED: "border-rose-300/20 bg-rose-300/10 text-rose-100",
    DO_NOT_CONTACT: "border-zinc-300/20 bg-zinc-300/10 text-zinc-200",
    CANCELLED: "border-zinc-300/20 bg-zinc-300/10 text-zinc-200",
    NEW: "border-white/10 bg-white/5 text-slate-300",
  };
  return tones[status] ?? tones.NEW;
}

function callStatusTone(status: string) {
  const tones: Record<string, string> = {
    RINGING: "border-cyan-300/20 bg-cyan-300/10 text-cyan-100",
    ANSWERED: "border-emerald-300/20 bg-emerald-300/10 text-emerald-100",
    COMPLETED: "border-slate-300/20 bg-slate-300/10 text-slate-200",
    MISSED: "border-rose-300/20 bg-rose-300/10 text-rose-100",
  };
  return tones[status] ?? "border-white/10 bg-white/5 text-slate-300";
}

function callStatusLabel(status: string) {
  const labels: Record<string, string> = {
    RINGING: "Ringing",
    ANSWERED: "Attended",
    COMPLETED: "Ended",
    MISSED: "Missed",
  };
  return labels[status] || status.replaceAll("_", " ");
}

function formatDuration(seconds: number | null) {
  if (!seconds) return null;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return minutes ? `${minutes}m ${remainingSeconds}s` : `${remainingSeconds}s`;
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    QUEUED: "Queued",
    SENDING: "Sending",
    SENT: "Sent",
    OPENED: "Opened",
    FORM_STARTED: "Form started",
    FORM_SUBMITTED: "Form submitted",
    REPLIED: "Customer replied",
    FAILED: "Failed",
    DO_NOT_CONTACT: "Do not contact",
    NEW: "New",
    OPTED_IN: "Opted in",
    CANCELLED: "Cancelled",
  };
  return labels[status] || status.replaceAll("_", " ");
}

function formStatusLabel(lead: Lead) {
  if (lead.hasSubmittedForm) return "Form submitted";
  if (lead.formSubmission?.status === "FORM_STARTED") return "Started, not submitted";
  if (lead.formSubmission?.status === "OPENED") return "Opened, not submitted";
  if (lead.formToken) return "Pending form";
  return "No form";
}

export function WhatsAppLeadsClient({
  leads,
  failedCount,
  retryPreview,
  total,
  page,
  totalPages,
  incomingCallLeads,
  avgDelaySeconds,
  totalQueued,
  accountStatus,
  autoReplyEnabled,
  serverTime,
  publicUrlError,
  initialSearch,
  activeTab,
  tabCounts,
}: {
  leads: Lead[];
  failedCount: number;
  retryPreview: RetryPreview;
  total: number;
  page: number;
  totalPages: number;
  incomingCallLeads: {
    id: string;
    displayName: string;
    phone: string;
    updatedAt: Date | string;
    createdAt: Date | string;
    waStatus: WhatsAppLeadStatus | null;
    waLeadId: string | null;
    queuePosition: number | null;
    targetTime: string | null;
    callStatus: string | null;
    callDuration: number | null;
  }[];
  avgDelaySeconds: number;
  totalQueued: number;
  accountStatus: string;
  autoReplyEnabled: boolean;
  serverTime: number;
  publicUrlError: string | null;
  initialSearch?: string;
  activeTab: string;
  tabCounts: TabCounts;
}) {
  const [showRetryConfirm, setShowRetryConfirm] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [retryResult, setRetryResult] = useState<RetryFailedLeadsResult | null>(null);
  const [showCleanupConfirm, setShowCleanupConfirm] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<BulkCleanupResult | null>(null);
  const [expandedLeadId, setExpandedLeadId] = useState<string | null>(null);
  const [search, setSearch] = useState(initialSearch || "");
  const [loadingCallIds, setLoadingCallIds] = useState<Record<string, boolean>>({});
  const router = useRouter();

  useEffect(() => {
    const delayDebounceId = setTimeout(() => {
      if (typeof window === "undefined") return;
      const params = new URLSearchParams(window.location.search);
      const currentQ = params.get("q") || "";
      if (currentQ === search) return;
      if (search) params.set("q", search);
      else params.delete("q");
      params.set("page", "1");
      router.push(`/admin/whatsapp/leads?${params.toString()}`);
    }, 400);

    return () => clearTimeout(delayDebounceId);
  }, [search, router]);

  type DateMode = "today" | "last24h" | "custom";
  const [dateMode, setDateMode] = useState<DateMode>("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [filterNow, setFilterNow] = useState(serverTime);

  const filteredIncomingCallLeads = useMemo(() => {
    return incomingCallLeads.filter((call) => {
      const t = new Date(call.createdAt).getTime();
      if (dateMode === "today") {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);
        return t >= todayStart.getTime() && t <= todayEnd.getTime();
      }
      if (dateMode === "last24h") return t >= filterNow - 24 * 60 * 60 * 1000;
      const from = customFrom ? new Date(customFrom).getTime() : 0;
      const to = customTo ? new Date(`${customTo}T23:59:59`).getTime() : Infinity;
      return t >= from && t <= to;
    });
  }, [incomingCallLeads, dateMode, customFrom, customTo, filterNow]);

  useEffect(() => {
    if (dateMode !== "last24h") return;
    const interval = setInterval(() => setFilterNow(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, [dateMode]);

  useEffect(() => {
    const interval = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(interval);
  }, [router]);

  const handleManualQueue = async (callId: string) => {
    setLoadingCallIds((prev) => ({ ...prev, [callId]: true }));
    try {
      await manualQueueWhatsAppForCallLeadAction(callId);
      router.refresh();
    } catch (err) {
      console.error("[whatsapp-leads-client] Failed to manual queue:", err);
    } finally {
      setTimeout(() => setLoadingCallIds((prev) => ({ ...prev, [callId]: false })), 1200);
    }
  };

  const filtered = leads.filter((lead) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return lead.displayName.toLowerCase().includes(q) || lead.phone.includes(q);
  });

  const retryRowsToShow = (retryResult?.skippedRows ?? retryPreview.skippedRows).slice(0, 8);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-cyan-400">WhatsApp</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">WhatsApp leads</h1>
        <p className="mt-2 text-sm text-slate-400">One row per lead with current status, latest queue state, form state, and retry controls.</p>
      </header>

      {(accountStatus !== "CONNECTED" || !autoReplyEnabled) && (
        <div className="flex flex-col gap-3">
          {accountStatus !== "CONNECTED" && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3">
              <p className="text-sm font-semibold text-red-200">Device not connected</p>
              <p className="mt-0.5 text-xs text-red-300/70">Worker status is {accountStatus}. Queued messages will not send until the device is connected.</p>
            </div>
          )}
          {!autoReplyEnabled && (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3">
              <p className="text-sm font-semibold text-amber-200">Auto-reply is paused</p>
              <p className="mt-0.5 text-xs text-amber-300/70">The queue can build up, but the worker will not dispatch messages.</p>
            </div>
          )}
        </div>
      )}

      <section className="mt-4 grid gap-5 items-start">
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-white">Incoming calls</h2>
              <p className="mt-1 text-xs text-slate-400">
                Recent incoming calls. {totalQueued > 0 && <span className="text-cyan-300">{totalQueued} active queue item{totalQueued === 1 ? "" : "s"}; avg {Math.round(avgDelaySeconds / 60)}min gap</span>}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {(["today", "last24h", "custom"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setDateMode(mode)}
                  className={`h-7 rounded-md border px-3 text-[11px] font-semibold transition ${dateMode === mode ? "border-cyan-400/50 bg-cyan-400/15 text-cyan-300" : "border-white/10 bg-black/30 text-slate-400 hover:border-white/20 hover:text-slate-200"}`}
                >
                  {mode === "today" ? "Today" : mode === "last24h" ? "Last 24 Hours" : "Custom"}
                </button>
              ))}
              {dateMode === "custom" && (
                <>
                  <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-7 rounded-md border border-white/10 bg-black/40 px-2 text-[11px] text-slate-200 outline-none focus:border-cyan-400" />
                  <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-7 rounded-md border border-white/10 bg-black/40 px-2 text-[11px] text-slate-200 outline-none focus:border-cyan-400" />
                </>
              )}
              <span className="text-[11px] text-slate-500">{filteredIncomingCallLeads.length} calls</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            {filteredIncomingCallLeads.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-500">No incoming calls for this period.</p>
            ) : (
              <table className="w-full min-w-[480px] text-left text-sm">
                <thead className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
                  <tr>
                    <th className="border-b border-white/10 py-2">Caller</th>
                    <th className="border-b border-white/10 py-2">Call Status</th>
                    <th className="border-b border-white/10 py-2">Date</th>
                    <th className="border-b border-white/10 py-2 text-center">Queue #</th>
                    <th className="border-b border-white/10 py-2 text-center">Est. time</th>
                    <th className="border-b border-white/10 py-2 text-right">WA status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05]">
                  {filteredIncomingCallLeads.map((call) => (
                    <tr key={call.id}>
                      <td className="py-2.5"><p className="text-xs font-medium text-slate-200">{call.displayName}</p><p className="text-[11px] text-slate-500">{call.phone}</p></td>
                      <td className="py-2.5">
                        {call.callStatus ? (
                          <div>
                            <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${callStatusTone(call.callStatus)}`}>{callStatusLabel(call.callStatus)}</span>
                            {call.callDuration ? <p className="mt-1 text-[11px] text-slate-500">{formatDuration(call.callDuration)}</p> : null}
                          </div>
                        ) : <span className="text-[11px] text-slate-500">--</span>}
                      </td>
                      <td className="py-2.5 text-[11px] text-slate-500">{formatDate(call.createdAt)}</td>
                      <td className="py-2.5 text-center">{call.queuePosition ? <span className="text-xs font-bold text-cyan-200">#{call.queuePosition}</span> : <span className="text-[11px] text-slate-500">--</span>}</td>
                      <td className="py-2.5 text-center text-xs"><LiveCountdown targetTime={call.targetTime} queueStatus={call.waStatus} accountStatus={accountStatus} autoReplyEnabled={autoReplyEnabled} /></td>
                      <td className="py-2.5 text-right">
                        {call.waStatus ? (
                          <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${statusTone(call.waStatus)}`}>{statusLabel(call.waStatus)}</span>
                        ) : loadingCallIds[call.id] ? (
                          <button disabled className="rounded border border-cyan-300/20 bg-cyan-300/10 px-2 py-1 text-[10px] font-bold text-cyan-200">Queueing...</button>
                        ) : (
                          <div className="flex items-center justify-end gap-1.5">
                            <button onClick={() => handleManualQueue(call.id)} className="rounded border border-amber-300/20 bg-amber-300/10 px-2 py-1 text-[10px] font-bold text-amber-200 transition hover:bg-amber-300/20">Send WA</button>
                            <form action={deleteCallLeadDirectAction} className="inline-flex"><input name="callLeadId" type="hidden" value={call.id} /><button className="rounded border border-rose-300/20 bg-rose-300/10 px-2 py-1 text-[10px] font-bold text-rose-300 transition hover:bg-rose-300/20" type="submit">Delete</button></form>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-bold text-white">WhatsApp Leads <span className="ml-1 text-sm font-normal text-slate-500">({total})</span></h2>
            <div className="flex flex-wrap items-center gap-2">
              <button className="h-9 rounded-lg border border-amber-300/20 bg-amber-300/10 px-3 text-xs font-bold text-amber-100 transition hover:bg-amber-300/15" type="button" onClick={() => { setCleanupResult(null); setShowCleanupConfirm(true); }}>
                Clean up failed & awaiting
              </button>
              {failedCount > 0 && (
                <button className="h-9 rounded-lg border border-rose-300/20 bg-rose-300/10 px-3 text-xs font-bold text-rose-100 transition hover:bg-rose-300/15" type="button" onClick={() => { setRetryResult(null); setShowRetryConfirm(true); }}>
                  Retry failed ({retryPreview.retryable}/{retryPreview.totalFailed} retryable)
                </button>
              )}
            </div>
          </div>

          {showCleanupConfirm && (
            <div className="mt-3 rounded-lg border border-amber-400/30 bg-amber-950/60 p-4">
              <p className="text-sm font-semibold text-amber-200">Confirm bulk cleanup</p>
              <p className="mt-2 text-xs text-slate-300">This will permanently archive all <strong>failed</strong> and <strong>awaiting form</strong> WhatsApp leads. Submitted and replied leads will be kept safe.</p>
              {cleanupResult && (
                <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-5">
                  <div className="rounded border border-white/10 bg-black/20 p-2"><span className="text-slate-500">Total cleaned</span><p className="text-lg font-bold text-white">{cleanupResult.totalCleaned}</p></div>
                  <div className="rounded border border-rose-300/20 bg-rose-300/10 p-2"><span className="text-rose-200/80">Failed removed</span><p className="text-lg font-bold text-rose-100">{cleanupResult.failedCleaned}</p></div>
                  <div className="rounded border border-amber-300/20 bg-amber-300/10 p-2"><span className="text-amber-200/80">Awaiting removed</span><p className="text-lg font-bold text-amber-100">{cleanupResult.awaitingCleaned}</p></div>
                  <div className="rounded border border-emerald-300/20 bg-emerald-300/10 p-2"><span className="text-emerald-200/80">Submitted kept</span><p className="text-lg font-bold text-emerald-100">{cleanupResult.keptSubmitted}</p></div>
                  <div className="rounded border border-violet-300/20 bg-violet-300/10 p-2"><span className="text-violet-200/80">Replied kept</span><p className="text-lg font-bold text-violet-100">{cleanupResult.keptReplied}</p></div>
                </div>
              )}
              <div className="mt-3 flex items-center gap-2">
                <button
                  className="h-8 rounded-lg border border-amber-300/30 bg-amber-500/20 px-4 text-xs font-bold text-amber-100 transition hover:bg-amber-500/30 disabled:opacity-50"
                  disabled={cleaning}
                  onClick={async () => {
                    setCleaning(true);
                    try {
                      const result = await bulkCleanupNonSubmittedLeadsAction();
                      setCleanupResult(result);
                      router.refresh();
                    } finally {
                      setCleaning(false);
                    }
                  }}
                >
                  {cleaning ? "Cleaning..." : cleanupResult ? "Run again" : "Yes, clean up now"}
                </button>
                <button className="h-8 rounded-lg border border-white/10 px-4 text-xs font-semibold text-slate-300 transition hover:bg-white/5" onClick={() => setShowCleanupConfirm(false)} disabled={cleaning}>Close</button>
              </div>
            </div>
          )}

          {publicUrlError && (
            <div className="mt-3 rounded-lg border border-rose-300/30 bg-rose-950/60 px-4 py-3 text-sm text-rose-100">
              Public form links are unavailable: {publicUrlError}
            </div>
          )}

          {showRetryConfirm && (
            <div className="mt-3 rounded-lg border border-rose-400/30 bg-rose-950/60 p-4">
              <p className="text-sm font-semibold text-rose-200">Confirm bulk retry</p>
              <div className="mt-2 grid gap-2 text-xs text-slate-300 sm:grid-cols-3">
                <div className="rounded border border-white/10 bg-black/20 p-2"><span className="text-slate-500">Failed</span><p className="text-lg font-bold text-white">{retryPreview.totalFailed}</p></div>
                <div className="rounded border border-emerald-300/20 bg-emerald-300/10 p-2"><span className="text-emerald-200/80">Retryable</span><p className="text-lg font-bold text-emerald-100">{retryPreview.retryable}</p></div>
                <div className="rounded border border-amber-300/20 bg-amber-300/10 p-2"><span className="text-amber-200/80">Skipped</span><p className="text-lg font-bold text-amber-100">{retryPreview.skipped}</p></div>
              </div>
              {retryRowsToShow.length > 0 && (
                <div className="mt-3 rounded border border-white/10 bg-black/20 p-3">
                  <p className="text-xs font-semibold text-slate-300">Skipped reasons</p>
                  <ul className="mt-2 space-y-1 text-xs text-slate-400">
                    {retryRowsToShow.map((row) => <li key={row.leadId}>{row.phone}: {row.reasons.join("; ")}</li>)}
                  </ul>
                </div>
              )}
              {retryResult && (
                <p className="mt-3 text-xs text-emerald-200">Retried {retryResult.retried}. Skipped {retryResult.skipped}. Retryable at confirmation time: {retryResult.retryable}.</p>
              )}
              <div className="mt-3 flex items-center gap-2">
                <button
                  className="h-8 rounded-lg border border-rose-300/30 bg-rose-500/20 px-4 text-xs font-bold text-rose-100 transition hover:bg-rose-500/30 disabled:opacity-50"
                  disabled={retrying || retryPreview.retryable === 0}
                  onClick={async () => {
                    setRetrying(true);
                    try {
                      const result = await retryFailedLeadsAction();
                      setRetryResult(result);
                      router.refresh();
                    } finally {
                      setRetrying(false);
                    }
                  }}
                >
                  {retrying ? "Retrying..." : `Yes, retry ${retryPreview.retryable}`}
                </button>
                <button className="h-8 rounded-lg border border-white/10 px-4 text-xs font-semibold text-slate-300 transition hover:bg-white/5" onClick={() => setShowRetryConfirm(false)} disabled={retrying}>Close</button>
              </div>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-1.5 border-b border-white/10 pb-3">
            {[
              { key: "all", label: "All", count: tabCounts.all },
              { key: "queue", label: "Queue", count: tabCounts.queue },
              { key: "awaiting", label: "Awaiting Form", count: tabCounts.awaiting },
              { key: "failed", label: "Failed", count: tabCounts.failed },
              { key: "replied", label: "Replied", count: tabCounts.replied },
              { key: "submitted", label: "Form Submitted", count: tabCounts.submitted },
            ].map((t) => (
              <a key={t.key} href={`/admin/whatsapp/leads?tab=${t.key}&page=1${search ? `&q=${encodeURIComponent(search)}` : ""}`} className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[11px] font-semibold transition ${activeTab === t.key ? "border-cyan-400/50 bg-cyan-400/15 text-cyan-300" : "border-white/10 bg-black/30 text-slate-400 hover:border-white/20 hover:text-slate-200"}`}>
                {t.label}<span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${activeTab === t.key ? "bg-cyan-400/20 text-cyan-300" : t.key === "failed" && t.count > 0 ? "bg-rose-400/20 text-rose-300" : "bg-white/10 text-slate-500"}`}>{t.count}</span>
              </a>
            ))}
          </div>

          <div className="mt-4"><input className="h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-300" onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or phone number..." type="search" value={search} /></div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.16em] text-slate-500">
                <tr>
                  <th className="border-b border-white/10 py-3">Lead</th>
                  <th className="border-b border-white/10 py-3">WhatsApp status</th>
                  <th className="border-b border-white/10 py-3">Form status</th>
                  <th className="border-b border-white/10 py-3">Latest queue</th>
                  <th className="border-b border-white/10 py-3">Last contact</th>
                  <th className="border-b border-white/10 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {filtered.map((lead) => (
                  <Fragment key={lead.id}>
                    <tr key={lead.id}>
                      <td className="py-3 pr-3">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-white">{lead.displayName}</p>
                          {lead.accountLabel && (
                            <span className="rounded border border-cyan-400/30 bg-cyan-400/10 px-1.5 py-0.5 text-[10px] font-medium text-cyan-300">
                              {lead.accountLabel}
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-slate-500">{lead.phone}</p>
                        {lead.lastReplySnippet && <p className="mt-1 line-clamp-2 max-w-xs text-xs text-violet-300">Reply: {lead.lastReplySnippet}</p>}
                        {lead.lastError && <p className="mt-1 max-w-xs text-xs text-rose-300">Error: {lead.lastError}</p>}
                      </td>
                      <td className="py-3"><span className={`rounded-lg border px-2 py-1 text-xs font-bold ${statusTone(lead.lifecycleStatus)}`}>{statusLabel(lead.lifecycleStatus)}</span></td>
                      <td className="py-3 text-xs">
                        <span className={lead.hasSubmittedForm ? "font-semibold text-emerald-300" : "text-slate-400"}>{formStatusLabel(lead)}</span>
                        {lead.publicFormUrl && !lead.hasSubmittedForm && <a className="mt-1 block max-w-[220px] break-all font-mono text-[11px] text-emerald-400 underline" href={lead.publicFormUrl} target="_blank" rel="noreferrer">{lead.publicFormUrl}</a>}
                      </td>
                      <td className="py-3 text-xs">
                        {lead.latestQueueItem ? (
                          <div>
                            <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${statusTone(lead.latestQueueItem.status)}`}>{statusLabel(lead.latestQueueItem.status)}</span>
                            {lead.targetTime && <p className="mt-1 text-cyan-200">Est. <LiveCountdown targetTime={lead.targetTime} queueStatus={lead.latestQueueItem.status} accountStatus={accountStatus} autoReplyEnabled={autoReplyEnabled} /></p>}
                            {lead.latestQueueItem.lastError && <p className="mt-1 max-w-[220px] text-rose-300">{lead.latestQueueItem.lastError}</p>}
                          </div>
                        ) : <span className="text-slate-500">No queue item</span>}
                      </td>
                      <td className="py-3 text-xs text-slate-400">
                        {lead.lastReplyAt ? <><span className="block text-violet-300">Replied {formatDate(lead.lastReplyAt)}</span>{lead.lastSentAt && <span className="block">Sent {formatDate(lead.lastSentAt)}</span>}</> : lead.lastSentAt ? formatDate(lead.lastSentAt) : formatDate(lead.createdAt)}
                      </td>
                      <td className="py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <button type="button" onClick={() => setExpandedLeadId((current) => current === lead.id ? null : lead.id)} className="h-9 rounded-lg border border-white/10 px-3 text-xs font-bold text-slate-200 transition hover:bg-white/10">{expandedLeadId === lead.id ? "Hide" : "Details"}</button>
                          {lead.retryEligibility.retryable && <form action={retryWhatsAppLeadAction} className="inline-flex"><input name="leadId" type="hidden" value={lead.id} /><button className="h-9 rounded-lg border border-emerald-300/20 bg-emerald-300/10 px-3 text-xs font-bold text-emerald-100 transition hover:bg-emerald-300/15" type="submit">Retry</button></form>}
                          <form action={deleteWhatsAppLeadAction} className="inline-flex"><input name="leadId" type="hidden" value={lead.id} /><button className="h-9 rounded-lg border border-rose-300/20 px-3 text-xs font-bold text-rose-300/80 transition hover:bg-rose-300/10 hover:text-rose-300" type="submit">Delete</button></form>
                        </div>
                      </td>
                    </tr>
                    {expandedLeadId === lead.id && (
                      <tr key={`${lead.id}-details`}>
                        <td colSpan={6} className="bg-black/20 px-4 py-4">
                          <div className="grid gap-4 lg:grid-cols-[1.4fr_0.8fr_0.8fr]">
                            <div>
                              <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Queue history</p>
                              <div className="mt-2 overflow-x-auto">
                                <table className="w-full min-w-[520px] text-xs">
                                  <thead className="text-slate-500"><tr><th className="py-1 text-left">Status</th><th className="py-1 text-left">Queued</th><th className="py-1 text-left">Sent</th><th className="py-1 text-left">Failed reason</th><th className="py-1 text-left">Token</th></tr></thead>
                                  <tbody className="divide-y divide-white/5">
                                    {lead.queueItems.map((item, index) => (
                                      <tr key={item.id}>
                                        <td className="py-1.5"><span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${statusTone(item.status)}`}>{statusLabel(item.status)}</span>{index === 0 && <span className="ml-1 text-[10px] text-cyan-300">latest</span>}</td>
                                        <td className="py-1.5 text-slate-400">{formatDate(item.queuedAt)}</td>
                                        <td className="py-1.5 text-slate-400">{formatDate(item.sentAt)}</td>
                                        <td className="py-1.5 max-w-xs text-rose-300">{item.lastError || "--"}</td>
                                        <td className="py-1.5 font-mono text-[11px] text-slate-400">{item.formToken}</td>
                                      </tr>
                                    ))}
                                    {!lead.queueItems.length && <tr><td colSpan={5} className="py-2 text-slate-500">No queue history.</td></tr>}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                            <div>
                              <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Form details</p>
                              <dl className="mt-2 grid gap-1 text-xs text-slate-300">
                                <dt className="text-slate-500">Form token</dt><dd className="break-all font-mono">{lead.formSubmission?.formToken || lead.formToken || "--"}</dd>
                                <dt className="text-slate-500">Submission status</dt><dd>{lead.formSubmission?.status || "No submission"}</dd>
                                <dt className="text-slate-500">Submitted time</dt><dd>{formatDate(lead.formSubmission?.submittedAt ?? null)}</dd>
                                <dt className="text-slate-500">Name</dt><dd>{lead.formSubmission?.name || lead.formName || "--"}</dd>
                                <dt className="text-slate-500">City</dt><dd>{lead.formSubmission?.city || lead.formCity || "--"}</dd>
                                <dt className="text-slate-500">Property</dt><dd>{lead.formSubmission?.propertyType || lead.formPropertyType || "--"}</dd>
                              </dl>
                            </div>
                            <div>
                              <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Inbound replies</p>
                              {lead.lastReplyAt || lead.lastReplySnippet ? (
                                <div className="mt-2 rounded border border-violet-300/20 bg-violet-300/10 p-3 text-xs text-violet-100">
                                  <p className="font-semibold">{formatDate(lead.lastReplyAt)}</p>
                                  <p className="mt-1 whitespace-pre-wrap">{lead.lastReplySnippet || "Reply detected"}</p>
                                </div>
                              ) : <p className="mt-2 text-xs text-slate-500">No inbound reply recorded.</p>}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
                {!filtered.length && <tr><td className="py-8 text-slate-500" colSpan={6}>{search ? `No leads matching "${search}".` : "No WhatsApp leads yet."}</td></tr>}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between gap-4 border-t border-white/10 pt-4">
              <p className="text-sm text-slate-500">Page {page} of {totalPages}</p>
              <div className="flex gap-2">
                {page > 1 && <a href={`/admin/whatsapp/leads?tab=${activeTab}&page=${page - 1}${search ? `&q=${encodeURIComponent(search)}` : ""}`} className="h-9 rounded-lg border border-white/10 px-4 text-xs font-semibold leading-9 text-slate-200 transition hover:bg-white/10">Previous</a>}
                {page < totalPages && <a href={`/admin/whatsapp/leads?tab=${activeTab}&page=${page + 1}${search ? `&q=${encodeURIComponent(search)}` : ""}`} className="h-9 rounded-lg border border-cyan-300/20 bg-cyan-300/10 px-4 text-xs font-semibold leading-9 text-cyan-100 transition hover:bg-cyan-300/15">Next</a>}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
