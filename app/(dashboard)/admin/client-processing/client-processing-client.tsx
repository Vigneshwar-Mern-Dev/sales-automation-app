"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { CallLeadStatus, WhatsAppLeadStatus } from "@/app/lib/prisma-enums";
import {
  manualQueueWhatsAppForCallLeadAction,
  retryWhatsAppLeadAction,
  deleteCallLeadDirectAction,
} from "@/app/lib/whatsapp-actions";
import { LiveCountdown } from "@/app/(dashboard)/components/live-countdown";
import type { WhatsAppQueueEstimate } from "@/app/lib/whatsapp-queue-eta";

type Row = {
  id: string;
  phone: string;
  displayName: string;
  email: string | null;
  city: string | null;
  address: string | null;
  ownershipType: string | null;
  language: string | null;
  message: string | null;
  status: CallLeadStatus;
  assignedToId: string | null;
  assignedToName: string | null;
  lastContactedAt: Date | null;
  nextFollowUpAt: Date | null;
  isImportant: boolean;
  updatedAt: Date;
  createdAt: Date;
  // WhatsApp fields
  waLeadId: string | null;
  waStatus: WhatsAppLeadStatus | null;
  waLastSentAt: Date | null;
  waLastReplyAt: Date | null;
  waLastReplySnippet: string | null;
  waLastError: string | null;
  queuePosition: number | null;
  targetTime: string | null;
  eta: WhatsAppQueueEstimate | null;
};

type Agent = {
  id: string;
  username: string;
  email: string;
  department: string | null;
};

function formatDate(value: Date | null) {
  if (!value) return "Never";
  return new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
  });
}

function callStatusTone(status: string) {
  const tones: Record<string, string> = {
    NEW: "border-cyan-300/20 bg-cyan-300/10 text-cyan-100",
    CONTACTED: "border-sky-300/20 bg-sky-300/10 text-sky-100",
    FOLLOW_UP: "border-amber-300/20 bg-amber-300/10 text-amber-100",
    INTERESTED: "border-violet-300/20 bg-violet-300/10 text-violet-100",
    NOT_INTERESTED: "border-rose-300/20 bg-rose-300/10 text-rose-100",
    NO_RESPONSE: "border-zinc-300/20 bg-zinc-300/10 text-zinc-300",
    CONVERTED: "border-emerald-300/20 bg-emerald-300/10 text-emerald-100",
    CLOSED: "border-slate-500/20 bg-slate-500/10 text-slate-400",
  };
  return tones[status] ?? tones.NEW;
}

function callStatusLabel(status: string) {
  const labels: Record<string, string> = {
    NEW: "New",
    CONTACTED: "In Progress",
    FOLLOW_UP: "Follow-up",
    INTERESTED: "Interested",
    NOT_INTERESTED: "Not Interested",
    NO_RESPONSE: "No Response",
    CONVERTED: "Completed",
    CLOSED: "Closed",
  };
  return labels[status] || status;
}

function waStatusTone(status: string | null) {
  if (!status) return "border-white/10 bg-white/5 text-slate-400";
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

export function ClientProcessingClient({
  rows,
  agents,
  total,
  page,
  totalPages,
  avgDelaySeconds,
  totalCallLeads,
  totalQueued,
  totalSent,
  totalReplied,
  totalFailed,
  accountHealth,
  serverTime,
  initialSearch,
  initialAgent,
  initialCallStatus,
  initialWaStatus,
}: {
  rows: Row[];
  agents: Agent[];
  total: number;
  page: number;
  totalPages: number;
  avgDelaySeconds: number;
  totalCallLeads: number;
  totalQueued: number;
  totalSent: number;
  totalReplied: number;
  totalFailed: number;
  accountHealth: Array<{ id: string; label: string; status: string; autoReplyEnabled: boolean }>;
  serverTime: number;
  initialSearch: string;
  initialAgent: string;
  initialCallStatus: string;
  initialWaStatus: string;
}) {
  const router = useRouter();
  const [search, setSearch] = useState(initialSearch || "");
  const [agent, setAgent] = useState(initialAgent || "ALL");
  const [callStatus, setCallStatus] = useState(initialCallStatus || "ALL");
  const [waStatus, setWaStatus] = useState(initialWaStatus || "ALL");
  const [loadingIds, setLoadingIds] = useState<Record<string, boolean>>({});

  // Sync state filter selections to URL parameters with debounce
  useEffect(() => {
    const delayDebounceId = setTimeout(() => {
      if (typeof window === "undefined") return;
      const params = new URLSearchParams(window.location.search);
      let changed = false;

      const currentQ = params.get("q") || "";
      if (currentQ !== search) {
        if (search) params.set("q", search);
        else params.delete("q");
        changed = true;
      }

      const currentAgent = params.get("agent") || "ALL";
      if (currentAgent !== agent) {
        if (agent !== "ALL") params.set("agent", agent);
        else params.delete("agent");
        changed = true;
      }

      const currentCall = params.get("callStatus") || "ALL";
      if (currentCall !== callStatus) {
        if (callStatus !== "ALL") params.set("callStatus", callStatus);
        else params.delete("callStatus");
        changed = true;
      }

      const currentWa = params.get("waStatus") || "ALL";
      if (currentWa !== waStatus) {
        if (waStatus !== "ALL") params.set("waStatus", waStatus);
        else params.delete("waStatus");
        changed = true;
      }

      if (changed) {
        params.set("page", "1");
        router.push(`/admin/client-processing?${params.toString()}`);
      }
    }, 400);

    return () => clearTimeout(delayDebounceId);
  }, [search, agent, callStatus, waStatus, router]);

  // Periodically refresh the data to reflect live queue processing status
  useEffect(() => {
    const interval = setInterval(() => {
      router.refresh();
    }, 5000);
    return () => clearInterval(interval);
  }, [router]);

  const handleQueueWhatsApp = async (callLeadId: string) => {
    setLoadingIds((prev) => ({ ...prev, [callLeadId]: true }));
    try {
      await manualQueueWhatsAppForCallLeadAction(callLeadId);
      router.refresh();
    } catch (err) {
      console.error("[client-processing] Failed to queue lead:", err);
    } finally {
      setTimeout(() => {
        setLoadingIds((prev) => ({ ...prev, [callLeadId]: false }));
      }, 1000);
    }
  };

  const handlePageChange = (newPage: number) => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    params.set("page", String(newPage));
    router.push(`/admin/client-processing?${params.toString()}`);
  };

  const hasActiveFilters = search || agent !== "ALL" || callStatus !== "ALL" || waStatus !== "ALL";

  const handleClearFilters = () => {
    setSearch("");
    setAgent("ALL");
    setCallStatus("ALL");
    setWaStatus("ALL");
    router.push("/admin/client-processing");
  };

  return (
    <div className="space-y-6 pb-8">
      {/* Header section */}
      <header className="flex flex-col justify-between gap-4 rounded-xl border border-white/10 bg-gradient-to-br from-cyan-300/[0.04] to-transparent p-5 md:flex-row md:items-center">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">
            Client Processing Queue
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-white md:text-4xl">
            Client processing desk
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            Bridge Call Center voice leads to automated WhatsApp follow-ups (average interval: {Math.round(avgDelaySeconds / 60)} minutes). Monitor the real-time sync queues, handle delivery failures, and assign agents.
          </p>
        </div>
      </header>

      {/* Warnings panel */}
      {accountHealth.some((account) => account.status !== "CONNECTED" || !account.autoReplyEnabled) && (
        <div className="flex flex-col gap-3">
          {accountHealth.filter((account) => account.status !== "CONNECTED").map((account) => (
            <div className="flex items-center gap-3 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3" key={`offline-${account.id}`}>
              <svg className="h-5 w-5 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <p className="text-sm font-semibold text-red-200">{account.label}: device not connected</p>
                <p className="text-xs text-red-300/70 mt-0.5">
                  This worker is <span className="font-bold">{account.status}</span>. Only this sender account&apos;s queue is blocked.
                </p>
              </div>
            </div>
          ))}
          {accountHealth.filter((account) => !account.autoReplyEnabled).map((account) => (
            <div className="flex items-center gap-3 rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3" key={`paused-${account.id}`}>
              <svg className="h-5 w-5 text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <p className="text-sm font-semibold text-amber-200">{account.label}: sending is paused</p>
                <p className="text-xs text-amber-300/70 mt-0.5">
                  Automated messaging has been disabled. The processing queue will retain entries, but they won&apos;t be dispatched.
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Stats row */}
      <section className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        {[
          ["Call Leads", totalCallLeads, "text-white", "bg-white/[0.02]"],
          ["Queued on WA", totalQueued, "text-cyan-300", "bg-cyan-500/[0.02] border-cyan-500/10"],
          ["Sent WA", totalSent, "text-sky-300", "bg-sky-500/[0.02] border-sky-500/10"],
          ["Replied WA", totalReplied, "text-violet-300", "bg-violet-500/[0.02] border-violet-500/10"],
          ["Failed Sync", totalFailed, "text-rose-400", "bg-rose-500/[0.02] border-rose-500/10"],
        ].map(([label, value, colorClass, bgClass]) => (
          <div className={`rounded-xl border border-white/10 ${bgClass} p-4 text-center`} key={String(label)}>
            <p className={`text-2xl font-bold tracking-tight ${colorClass}`}>{value}</p>
            <p className="mt-1 text-xs text-slate-500 font-medium">{label}</p>
          </div>
        ))}
      </section>

      {/* Filter panel */}
      <section className="rounded-xl border border-white/10 bg-white/[0.02] p-5 space-y-4">
        <div className="grid gap-4 md:grid-cols-4">
          {/* Search box */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Search</label>
            <input
              type="text"
              placeholder="Name or phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-10 w-full rounded-lg border border-white/10 bg-black/40 px-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-300 transition"
            />
          </div>

          {/* Call center status filter */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Call Center Status</label>
            <select
              value={callStatus}
              onChange={(e) => setCallStatus(e.target.value)}
              className="h-10 w-full rounded-lg border border-white/10 bg-black/40 px-3 text-sm text-slate-300 outline-none focus:border-cyan-300 transition cursor-pointer"
            >
              <option value="ALL">All Call Statuses</option>
              <option value="NEW">New</option>
              <option value="CONTACTED">In Progress</option>
              <option value="FOLLOW_UP">Follow-up</option>
              <option value="INTERESTED">Interested</option>
              <option value="NOT_INTERESTED">Not Interested</option>
              <option value="NO_RESPONSE">No Response</option>
              <option value="CONVERTED">Completed</option>
              <option value="CLOSED">Closed</option>
            </select>
          </div>

          {/* WhatsApp sync status filter */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">WhatsApp Sync</label>
            <select
              value={waStatus}
              onChange={(e) => setWaStatus(e.target.value)}
              className="h-10 w-full rounded-lg border border-white/10 bg-black/40 px-3 text-sm text-slate-300 outline-none focus:border-cyan-300 transition cursor-pointer"
            >
              <option value="ALL">All Sync States</option>
              <option value="NOT_QUEUED">Not Queued (Unsynced)</option>
              <option value="QUEUED">Queued</option>
              <option value="SENT">Sent</option>
              <option value="REPLIED">Replied</option>
              <option value="FAILED">Failed</option>
              <option value="OPTED_IN">Opted In</option>
              <option value="DO_NOT_CONTACT">Do Not Contact</option>
            </select>
          </div>

          {/* Agent filter */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Assignee</label>
            <select
              value={agent}
              onChange={(e) => setAgent(e.target.value)}
              className="h-10 w-full rounded-lg border border-white/10 bg-black/40 px-3 text-sm text-slate-300 outline-none focus:border-cyan-300 transition cursor-pointer"
            >
              <option value="ALL">All Agents</option>
              <option value="UNASSIGNED">Unassigned</option>
              {agents.map((ag) => (
                <option value={ag.id} key={ag.id}>
                  {ag.username}
                </option>
              ))}
            </select>
          </div>
        </div>

        {hasActiveFilters && (
          <div className="flex justify-end pt-1">
            <button
              onClick={handleClearFilters}
              className="text-xs font-semibold text-cyan-400 hover:text-cyan-300 transition flex items-center gap-1"
            >
              Clear all filters
            </button>
          </div>
        )}
      </section>

      {/* Main leads table */}
      <section className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="text-lg font-semibold text-white">Leads desk</h2>
          <span className="text-xs text-slate-500 font-medium">{total} leads found</span>
        </div>

        <div className="overflow-x-auto">
          {rows.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-500">
              No matching client leads found. Try adjusting your search query or filters.
            </div>
          ) : (
            <table className="w-full min-w-[800px] text-left text-sm border-collapse">
              <thead className="text-xs uppercase tracking-[0.14em] text-slate-500 border-b border-white/10">
                <tr>
                  <th className="pb-3 font-semibold">Client</th>
                  <th className="pb-3 font-semibold">Assignee</th>
                  <th className="pb-3 font-semibold">Call Status</th>
                  <th className="pb-3 font-semibold">WhatsApp Sync</th>
                  <th className="pb-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {rows.map((row) => (
                  <tr className="hover:bg-white/[0.01] transition" key={row.id}>
                    {/* Client display name + phone */}
                    <td className="py-3.5 pr-3">
                      <p className="font-semibold text-slate-200 text-sm">{row.displayName}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{row.phone}</p>
                      {row.waLastReplySnippet && (
                        <p className="mt-1 line-clamp-1 max-w-sm text-xs text-violet-300">
                          Reply: {row.waLastReplySnippet}
                        </p>
                      )}
                    </td>

                    {/* Agent assigned */}
                    <td className="py-3.5 text-slate-300 text-sm">
                      {row.assignedToName ? (
                        <span className="inline-flex items-center gap-1 rounded bg-white/5 border border-white/10 px-2 py-0.5 text-xs text-slate-300">
                          {row.assignedToName}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-600">-- Unassigned</span>
                      )}
                    </td>

                    {/* Call Lead Status */}
                    <td className="py-3.5">
                      <span className={`rounded border px-2 py-0.5 text-xs font-semibold ${callStatusTone(row.status)}`}>
                        {callStatusLabel(row.status)}
                      </span>
                    </td>

                    {/* WhatsApp Status, countdowns or details */}
                    <td className="py-3.5">
                      {row.queuePosition ? (
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="rounded border border-cyan-300/20 bg-cyan-300/10 px-1.5 py-0.5 text-[10px] font-bold text-cyan-200">
                              QUEUED #{row.queuePosition}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 flex items-center gap-1">
                            Send in:{" "}
                            <span className="font-semibold text-cyan-300">
                              <LiveCountdown
                                targetTime={row.eta?.earliestAt ?? row.targetTime}
                                etaState={row.eta?.state}
                                accountLabel={row.eta?.accountLabel}
                                serverTime={serverTime}
                                queueStatus={row.waStatus}
                              />
                            </span>
                          </p>
                          {row.eta?.accountLabel ? <p className="text-[10px] text-slate-600">{row.eta.accountLabel}</p> : null}
                        </div>
                      ) : row.waStatus ? (
                        <div className="space-y-0.5">
                          <span className={`rounded border px-2 py-0.5 text-xs font-bold ${waStatusTone(row.waStatus)}`}>
                            {row.waStatus.replace("_", " ")}
                          </span>
                          {row.waStatus === "FAILED" && row.waLastError && (
                            <p className="text-[11px] text-rose-300 leading-tight max-w-xs mt-1" title={row.waLastError}>
                              Error: {row.waLastError}
                            </p>
                          )}
                          {row.waStatus === "SENT" && row.waLastSentAt && (
                            <p className="text-[11px] text-slate-500 mt-1">
                              Sent: {formatDate(row.waLastSentAt)}
                            </p>
                          )}
                          {row.waStatus === "REPLIED" && row.waLastReplyAt && (
                            <p className="text-[11px] text-slate-500 mt-1">
                              Replied: {formatDate(row.waLastReplyAt)}
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="rounded border border-white/5 bg-white/5 px-2 py-0.5 text-xs font-medium text-slate-500">
                          Not Processed
                        </span>
                      )}
                    </td>

                    {/* Actions: Send WA, Retry, Details, Delete */}
                    <td className="py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Queue WhatsApp Action */}
                        {!row.queuePosition && row.waStatus !== "SENT" && row.waStatus !== "REPLIED" ? (
                          loadingIds[row.id] ? (
                            <button disabled className="inline-flex items-center gap-1 rounded border border-cyan-300/20 bg-cyan-300/10 px-2.5 py-1 text-xs font-bold text-cyan-200">
                              <svg className="animate-spin h-3.5 w-3.5 text-cyan-200" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                              Queueing...
                            </button>
                          ) : row.waStatus === "FAILED" ? (
                            <form action={retryWhatsAppLeadAction} className="inline-flex">
                              <input name="leadId" type="hidden" value={row.waLeadId || ""} />
                              <button
                                className="rounded border border-amber-300/20 bg-amber-300/10 px-2.5 py-1 text-xs font-bold text-amber-200 transition hover:bg-amber-300/20 cursor-pointer"
                                type="submit"
                              >
                                Retry WA
                              </button>
                            </form>
                          ) : (
                            <button
                              onClick={() => handleQueueWhatsApp(row.id)}
                              className="rounded border border-cyan-300/20 bg-cyan-300/10 px-2.5 py-1 text-xs font-bold text-cyan-200 transition hover:bg-cyan-300/20 cursor-pointer"
                            >
                              + Send WA
                            </button>
                          )
                        ) : null}

                        {/* Delete Call Lead */}
                        <form action={deleteCallLeadDirectAction} className="inline-flex">
                          <input name="callLeadId" type="hidden" value={row.id} />
                          <button
                            onClick={(e) => {
                              if (!confirm("Are you sure you want to delete this lead? This will remove all call events and metadata.")) {
                                e.preventDefault();
                              }
                            }}
                            className="rounded border border-rose-300/20 bg-rose-300/10 px-2.5 py-1 text-xs font-bold text-rose-300 transition hover:bg-rose-300/20 cursor-pointer"
                            type="submit"
                          >
                            Delete
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-white/10 mt-6 pt-4">
            <p className="text-xs text-slate-500 font-medium">
              Page {page} of {totalPages}
            </p>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => handlePageChange(page - 1)}
                className="h-9 rounded-lg border border-white/10 bg-black/25 px-4 text-xs font-semibold text-slate-300 transition hover:bg-white/5 disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
              >
                Previous
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => handlePageChange(page + 1)}
                className="h-9 rounded-lg border border-white/10 bg-black/25 px-4 text-xs font-semibold text-slate-300 transition hover:bg-white/5 disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

