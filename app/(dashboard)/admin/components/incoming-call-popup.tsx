"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

type LiveCall = {
  id: string;
  callerNumber: string;
  status: string;
  callDirection: string;
  firstRingAt: string;
  simSlot: number | null;
  simDisplayName: string | null;
  simCarrierName: string | null;
  localContactName: string | null;
  companyPhone: {
    phoneNumber: string;
    label: string;
  };
  lead: {
    id: string;
    phone: string;
    displayName: string;
    status: string;
    assignedToId: string | null;
    createdAt: string;
    localContactName: string | null;
    _count: { sessions: number };
  };
};

function formatTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Now";
  }

  return date.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isNewLead(call: LiveCall, now: number) {
  const createdAt = new Date(call.lead.createdAt).getTime();
  return call.lead._count.sessions <= 1 || (!Number.isNaN(createdAt) && now - createdAt < 10 * 60 * 1000);
}

const STORAGE_KEY = "dismissed-call-popup-ids";

function loadDismissedFromStorage(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as string[];
      if (Array.isArray(parsed)) return new Set(parsed);
    }
  } catch {
    // Ignore corrupt data
  }
  return new Set();
}

function saveDismissedToStorage(ids: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // Storage full or unavailable
  }
}

export function IncomingCallPopup() {
  const [calls, setCalls] = useState<LiveCall[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => loadDismissedFromStorage());
  const [now, setNow] = useState(() => Date.now());
  const serverOffsetMs = useRef(0);

  // Persist dismissed IDs whenever they change
  const dismissCall = useCallback((callId: string) => {
    setDismissedIds((current) => {
      const next = new Set(current);
      next.add(callId);
      saveDismissedToStorage(next);
      return next;
    });
  }, []);

  useEffect(() => {
    let isMounted = true;
    let isLoading = false;
    const controller = new AbortController();

    async function loadLiveCalls() {
      if (isLoading) return;
      isLoading = true;

      try {
        const response = await fetch("/api/calls/live", {
          cache: "no-store",
          signal: controller.signal,
        });

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as { calls?: LiveCall[]; serverTime?: string };

        if (isMounted) {
          // Only show incoming calls in the popup
          const nextCalls = (payload.calls || []).filter(
            (call) => call.callDirection !== "OUTGOING",
          );
          const serverTime = payload.serverTime ? new Date(payload.serverTime).getTime() : Number.NaN;
          if (!Number.isNaN(serverTime)) {
            serverOffsetMs.current = serverTime - Date.now();
            setNow(serverTime);
          }
          setCalls(nextCalls);
          // Prune stale dismissed IDs that are no longer active
          const activeIds = new Set(nextCalls.map((call) => call.id));
          setDismissedIds((current) => {
            const pruned = new Set([...current].filter((id) => activeIds.has(id)));
            saveDismissedToStorage(pruned);
            return pruned;
          });
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        // Polling should fail quietly; the page itself should not break.
      } finally {
        isLoading = false;
      }
    }

    loadLiveCalls();
    const intervalId = window.setInterval(loadLiveCalls, 4000);
    const clockId = window.setInterval(() => setNow(Date.now() + serverOffsetMs.current), 1000);

    return () => {
      isMounted = false;
      controller.abort();
      window.clearInterval(intervalId);
      window.clearInterval(clockId);
    };
  }, []);

  const visibleCall = useMemo(
    () => calls.find((call) => !dismissedIds.has(call.id)),
    [calls, dismissedIds],
  );

  if (!visibleCall) {
    return null;
  }

  const isRinging = visibleCall.status === "RINGING";
  const newLead = isNewLead(visibleCall, now);
  const ringAgeSeconds = Math.max(
    0,
    Math.floor((now - new Date(visibleCall.firstRingAt).getTime()) / 1000),
  );

  return (
    <div className={`fixed bottom-5 right-5 z-[60] w-[min(calc(100vw-2.5rem),400px)] rounded-lg border p-4 shadow-2xl ${isRinging ? "border-emerald-300/35 bg-[#0d1512] shadow-emerald-950/40" : "border-cyan-300/30 bg-[#0d1118] shadow-cyan-950/40"}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] border-emerald-300/25 bg-emerald-300/10 text-emerald-100`}>
              {isRinging ? "Live Ringing" : "Active Call"}
            </span>
            {newLead ? (
              <span className="rounded-full border border-rose-300/25 bg-rose-300/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-rose-100">
                New lead
              </span>
            ) : null}
          </div>
          <h2 className="mt-2 text-xl font-bold text-white">
            {visibleCall.lead.displayName}
          </h2>
          <a
            className="mt-1 block text-sm font-semibold text-cyan-200 hover:underline"
            href={`tel:${visibleCall.lead.phone || visibleCall.callerNumber}`}
          >
            {visibleCall.lead.phone || visibleCall.callerNumber}
          </a>
        </div>
        <button
          aria-label="Dismiss incoming call popup"
          className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 bg-white/5 text-slate-400 transition hover:text-white"
          onClick={() => dismissCall(visibleCall.id)}
          type="button"
        >
          x
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg border border-white/10 bg-black/30 p-3 text-xs">
        <div>
          <p className="text-slate-500">Company Phone</p>
          <p className="mt-1 font-semibold text-slate-200">{visibleCall.companyPhone.label}</p>
          <p className="mt-1 text-slate-500">{visibleCall.companyPhone.phoneNumber}</p>
        </div>
        <div>
          <p className="text-slate-500">Started</p>
          <p className="mt-1 font-semibold text-slate-200">{formatTime(visibleCall.firstRingAt)}</p>
          <p className="mt-1 text-slate-500">
            {isRinging ? `${ringAgeSeconds}s ringing` : "On call"}
          </p>
        </div>
        <div>
          <p className="text-slate-500">Lead Signal</p>
          <p className="mt-1 font-semibold text-slate-200">{newLead ? "First touch" : `${visibleCall.lead._count.sessions} calls`}</p>
          <p className="mt-1 text-slate-500">{visibleCall.lead.status.replaceAll("_", " ")}</p>
        </div>
        <div>
          <p className="text-slate-500">SIM / Contact</p>
          <p className="mt-1 font-semibold text-slate-200">{visibleCall.simDisplayName || visibleCall.simCarrierName || (visibleCall.simSlot ? `SIM ${visibleCall.simSlot}` : "N/A")}</p>
          <p className="mt-1 truncate text-slate-500">{visibleCall.localContactName || visibleCall.lead.localContactName || "No local contact"}</p>
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <Link
          className="h-10 flex-1 rounded-lg bg-cyan-300 text-center text-sm font-bold leading-10 text-slate-950 transition hover:bg-cyan-200"
          href="/admin/calls/missed"
        >
          Open Callbacks
        </Link>
        <Link
          className="h-10 flex-1 rounded-lg border border-white/10 text-center text-sm font-bold leading-10 text-slate-200 transition hover:bg-white/10"
          href={`/admin/calls/leads?q=${encodeURIComponent(visibleCall.lead.phone)}`}
        >
          Open Lead
        </Link>
      </div>
    </div>
  );
}
