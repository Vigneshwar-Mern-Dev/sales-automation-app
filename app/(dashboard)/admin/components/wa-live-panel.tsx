"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const REFRESH_INTERVAL_MS = 15_000;

export function WaLivePanel() {
  const router = useRouter();
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [secondsAgo, setSecondsAgo] = useState(0);
  const [currentStatus, setCurrentStatus] = useState<string | null>(null);
  const [currentQr, setCurrentQr] = useState<string | null>(null);

  // Poll connection status and QR changes every 2 seconds
  useEffect(() => {
    let active = true;

    async function checkStatus() {
      try {
        const res = await fetch("/api/whatsapp/status");
        if (!res.ok) return;
        const data = await res.json();
        if (!active) return;

        if (currentStatus !== null && (data.status !== currentStatus || data.qrCodeData !== currentQr)) {
          router.refresh();
          setLastRefreshed(new Date());
          setSecondsAgo(0);
        }
        
        setCurrentStatus(data.status);
        setCurrentQr(data.qrCodeData);
      } catch (err) {
        console.error("Failed to check status:", err);
      }
    }

    checkStatus();
    const interval = setInterval(checkStatus, 2000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [currentStatus, currentQr, router]);

  // Keep page data refreshed every 15 seconds as a fallback
  useEffect(() => {
    const interval = setInterval(() => {
      router.refresh();
      setLastRefreshed(new Date());
      setSecondsAgo(0);
    }, REFRESH_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [router]);

  // Update "Xs ago" counter every second
  useEffect(() => {
    const tick = setInterval(() => {
      setSecondsAgo(Math.floor((Date.now() - lastRefreshed.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(tick);
  }, [lastRefreshed]);

  return (
    <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-400">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
      </span>
      Live — refreshed {secondsAgo}s ago
    </div>
  );
}
