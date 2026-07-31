"use client";

import { useEffect, useState } from "react";

function computeRemaining(targetMs: number) {
  return Math.max(0, Math.floor((targetMs - Date.now()) / 1000));
}

/**
 * A countdown timer that smoothly ticks down to a target timestamp.
 *
 * Resilient to parent re-renders (e.g. from router.refresh()) because:
 * - Uses Math.floor (no second-boundary oscillation)
 * - Initializes from prop immediately (no flash)
 * - Only re-initializes when targetTime string actually changes
 */
export function LiveCountdown({
  targetTime,
  queueStatus,
  accountStatus,
  autoReplyEnabled,
}: {
  targetTime: string | null;
  /** @deprecated No longer used; kept for backward-compat with existing call sites. */
  serverTime?: number;
  queueStatus?: string | null;
  accountStatus?: string;
  autoReplyEnabled?: boolean;
}) {
  const targetMs = targetTime ? new Date(targetTime).getTime() : 0;
  const [seconds, setSeconds] = useState(() => (targetMs ? computeRemaining(targetMs) : 0));

  useEffect(() => {
    if (!targetMs) return;

    const interval = setInterval(() => {
      setSeconds(computeRemaining(targetMs));
    }, 1000);
    return () => clearInterval(interval);
  }, [targetMs]);

  if (!targetTime) return <span className="text-slate-500">--</span>;
  if (accountStatus && accountStatus !== "CONNECTED") return <span className="text-amber-400/80">Worker offline</span>;
  if (autoReplyEnabled === false) return <span className="text-amber-400/80">Paused</span>;
  if (queueStatus === "SENDING") return <span className="animate-pulse text-emerald-300">Sending</span>;

  const currentRemaining = computeRemaining(targetMs);
  const displaySeconds = Math.min(seconds, currentRemaining);

  if (displaySeconds <= 0) return <span className="text-emerald-300">Due now</span>;
  if (displaySeconds > 60) return <span>{Math.floor(displaySeconds / 60)}m {String(displaySeconds % 60).padStart(2, "0")}s</span>;
  return <span>{displaySeconds}s</span>;
}
