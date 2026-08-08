"use client";

import { useEffect, useState } from "react";
import type { WhatsAppEtaState } from "@/app/lib/whatsapp-queue-eta";

function computeRemaining(targetMs: number) {
  return Math.max(0, Math.floor((targetMs - Date.now()) / 1000));
}

function formatRemaining(seconds: number) {
  if (seconds >= 60) {
    return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
  }
  return `${seconds}s`;
}

/**
 * A countdown timer that ticks down to the exact scheduled timestamp.
 *
 * Resilient to parent re-renders (e.g. from router.refresh()) because:
 * - Uses Math.floor (no second-boundary oscillation)
 * - Initializes from the target immediately (no flash)
 * - Only re-initializes when the target timestamp changes
 */
export function LiveCountdown({
  targetTime,
  etaState,
  accountLabel,
  queueStatus,
  accountStatus,
  autoReplyEnabled,
}: {
  targetTime: string | null;
  etaState?: WhatsAppEtaState;
  accountLabel?: string | null;
  /** @deprecated No longer used; kept for backward compatibility. */
  serverTime?: number;
  queueStatus?: string | null;
  accountStatus?: string;
  autoReplyEnabled?: boolean;
}) {
  const targetMs = targetTime ? new Date(targetTime).getTime() : 0;
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!targetMs) return;

    const interval = setInterval(() => {
      setTick((value) => value + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [targetMs]);

  if (!targetTime) return <span className="text-slate-500">--</span>;
  if (etaState === "SENDING" || queueStatus === "SENDING") {
    return <span className="animate-pulse text-emerald-300">Sending</span>;
  }
  if (etaState === "PAUSED") {
    return <span className="text-amber-400/80">Paused{accountLabel ? ` · ${accountLabel}` : ""}</span>;
  }
  if (etaState === "OFFLINE") {
    return <span className="text-amber-400/80">Worker offline{accountLabel ? ` · ${accountLabel}` : ""}</span>;
  }
  if (etaState === "HOURLY_LIMIT") {
    return <span className="text-amber-400/80">Waiting for hourly limit</span>;
  }
  if (etaState === "DAILY_LIMIT") {
    return <span className="text-amber-400/80">Waiting for daily limit</span>;
  }
  if (accountStatus && accountStatus !== "CONNECTED") {
    return <span className="text-amber-400/80">Worker offline</span>;
  }
  if (autoReplyEnabled === false) {
    return <span className="text-amber-400/80">Paused</span>;
  }

  const remainingSeconds = computeRemaining(targetMs);
  if (remainingSeconds <= 0) {
    return <span className="text-emerald-300">Due now</span>;
  }
  return <span>{formatRemaining(remainingSeconds)}</span>;
}
