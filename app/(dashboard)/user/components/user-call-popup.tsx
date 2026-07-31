"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  if (Number.isNaN(date.getTime())) return "Now";
  return date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

function isNewLead(call: LiveCall, now: number) {
  const createdAt = new Date(call.lead.createdAt).getTime();
  return call.lead._count.sessions <= 1 || (!Number.isNaN(createdAt) && now - createdAt < 10 * 60 * 1000);
}

export function UserCallPopup() {
  const [calls, setCalls] = useState<LiveCall[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => new Set());
  const [now, setNow] = useState(() => Date.now());
  const serverOffsetMs = useRef(0);

  useEffect(() => {
    let isMounted = true;
    let isLoading = false;
    const controller = new AbortController();

    async function loadLiveCalls() {
      if (isLoading) return;
      isLoading = true;

      try {
        const response = await fetch("/api/user/calls/live", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) return;
        const payload = (await response.json()) as { calls?: LiveCall[]; serverTime?: string };
        if (isMounted) {
          const nextCalls = payload.calls || [];
          const serverTime = payload.serverTime ? new Date(payload.serverTime).getTime() : Number.NaN;
          if (!Number.isNaN(serverTime)) {
            serverOffsetMs.current = serverTime - Date.now();
            setNow(serverTime);
          }
          setCalls(nextCalls);
          const activeIds = new Set(nextCalls.map((call) => call.id));
          setDismissedIds((current) => new Set([...current].filter((id) => activeIds.has(id))));
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        // Keep polling quiet; a popup should never break the workspace.
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

  if (!visibleCall) return null;

  const isRinging = visibleCall.status === "RINGING";
  const isOutgoing = visibleCall.callDirection === "OUTGOING";
  const newLead = isNewLead(visibleCall, now);
  const ringAgeSeconds = Math.max(0, Math.floor((now - new Date(visibleCall.firstRingAt).getTime()) / 1000));

  return (
    <div className="fixed bottom-5 right-5 z-[60] w-[min(calc(100vw-2.5rem),400px)] rounded-lg border border-[var(--user-accent-border)] bg-[#0d1118] p-4 shadow-2xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-[var(--user-accent-border)] bg-[var(--user-accent-muted)] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[var(--user-accent-text)]">
              {isOutgoing ? "Outgoing" : isRinging ? "Live Ringing" : "Active Call"}
            </span>
            {newLead ? (
              <span className="rounded-full border border-rose-300/25 bg-rose-300/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-rose-100">
                New lead
              </span>
            ) : null}
          </div>
          <h2 className="mt-2 text-xl font-bold text-white">{visibleCall.lead.displayName}</h2>
          <a className="mt-1 block text-sm font-semibold text-[var(--user-accent-text)] hover:underline" href={`tel:${visibleCall.lead.phone || visibleCall.callerNumber}`}>
            {visibleCall.lead.phone || visibleCall.callerNumber}
          </a>
        </div>
        <button
          aria-label="Dismiss incoming call popup"
          className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 bg-white/5 text-zinc-400 transition hover:text-white"
          onClick={() => setDismissedIds((current) => new Set([...current, visibleCall.id]))}
          type="button"
        >
          x
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg border border-white/10 bg-black/30 p-3 text-xs">
        <div>
          <p className="text-zinc-500">Company Phone</p>
          <p className="mt-1 font-semibold text-zinc-200">{visibleCall.companyPhone.label}</p>
          <p className="mt-1 text-zinc-500">{visibleCall.companyPhone.phoneNumber}</p>
        </div>
        <div>
          <p className="text-zinc-500">Started</p>
          <p className="mt-1 font-semibold text-zinc-200">{formatTime(visibleCall.firstRingAt)}</p>
          <p className="mt-1 text-zinc-500">
            {isRinging ? `${ringAgeSeconds}s ringing` : "On call"}
          </p>
        </div>
        <div>
          <p className="text-zinc-500">Lead Signal</p>
          <p className="mt-1 font-semibold text-zinc-200">{newLead ? "First touch" : `${visibleCall.lead._count.sessions} calls`}</p>
          <p className="mt-1 text-zinc-500">{visibleCall.lead.status.replaceAll("_", " ")}</p>
        </div>
        <div>
          <p className="text-zinc-500">SIM / Contact</p>
          <p className="mt-1 font-semibold text-zinc-200">{visibleCall.simDisplayName || visibleCall.simCarrierName || (visibleCall.simSlot ? `SIM ${visibleCall.simSlot}` : "N/A")}</p>
          <p className="mt-1 truncate text-zinc-500">{visibleCall.localContactName || visibleCall.lead.localContactName || "No local contact"}</p>
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <Link className="h-10 flex-1 rounded-lg bg-[var(--user-accent)] text-center text-sm font-bold leading-10 text-[var(--user-active-text)] transition hover:brightness-110" href="/user/calls/callbacks">
          Open Leads
        </Link>
        <Link className="h-10 flex-1 rounded-lg border border-white/10 text-center text-sm font-bold leading-10 text-zinc-200 transition hover:bg-white/10" href="/user/calls/assigned">
          Open Lead
        </Link>
      </div>
    </div>
  );
}
