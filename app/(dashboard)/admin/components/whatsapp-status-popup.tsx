"use client";

import { useEffect, useState, useRef } from "react";

type WhatsAppStatus = "CONNECTED" | "QR_REQUIRED" | "CONNECTING" | "DISCONNECTED" | "ERROR" | "PAUSED";

type ToastNotification = {
  status: WhatsAppStatus;
  title: string;
  message: string;
  type: "success" | "error" | "info" | "warning";
  phoneNumber?: string | null;
};

export function WhatsAppStatusPopup() {
  const [toast, setToast] = useState<ToastNotification | null>(null);
  const [visible, setVisible] = useState(false);
  const prevStatusRef = useRef<WhatsAppStatus | null>(null);
  const isFirstLoadRef = useRef(true);
  const autoDismissTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let active = true;

    async function checkStatus() {
      try {
        const res = await fetch("/api/whatsapp/status", {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!active) return;

        const newStatus: WhatsAppStatus = data.status;
        const phoneNumber: string | null = data.phoneNumber;

        // Skip toast on first load to prevent annoying startup alerts
        if (isFirstLoadRef.current) {
          prevStatusRef.current = newStatus;
          isFirstLoadRef.current = false;
          return;
        }

        // Detect connection status change transitions
        if (newStatus !== prevStatusRef.current) {
          let title = "WhatsApp Status Update";
          let message = `Connection status changed to ${newStatus.replace("_", " ")}`;
          let type: "success" | "error" | "info" | "warning" = "info";

          switch (newStatus) {
            case "CONNECTED":
              title = "WhatsApp Connected! 🎉";
              message = phoneNumber 
                ? `Primary device (${phoneNumber}) connected successfully. The sending queue is active.`
                : "Primary device connected successfully. The sending queue is active.";
              type = "success";
              break;
            case "QR_REQUIRED":
              title = "WhatsApp Action Required ⚠️";
              message = "Connection lost. Please scan the QR code to re-link your device.";
              type = "warning";
              break;
            case "CONNECTING":
              title = "Connecting to WhatsApp... ⏳";
              message = "Attempting to establish connection with WhatsApp Web. Please wait.";
              type = "info";
              break;
            case "DISCONNECTED":
              title = "WhatsApp Disconnected 🔴";
              message = "Device has disconnected. Reconnection attempt is in progress.";
              type = "error";
              break;
            case "ERROR":
              title = "WhatsApp Connection Error ❌";
              message = data.lastError || "An unexpected error occurred in the worker. Retrying...";
              type = "error";
              break;
            case "PAUSED":
              title = "WhatsApp Paused ⏸️";
              message = "Message sending has been paused by the administrator.";
              type = "info";
              break;
          }

          // Trigger Toast Notification
          setToast({
            status: newStatus,
            title,
            message,
            type,
            phoneNumber,
          });
          setVisible(true);

          // Auto dismiss after 6 seconds
          if (autoDismissTimerRef.current) {
            window.clearTimeout(autoDismissTimerRef.current);
          }
          autoDismissTimerRef.current = window.setTimeout(() => {
            setVisible(false);
          }, 6000);

          prevStatusRef.current = newStatus;
        }
      } catch (err) {
        console.error("[whatsapp-status-popup] Failed to check status:", err);
      }
    }

    // Initial check
    checkStatus();

    // Poll status every 4 seconds
    const interval = setInterval(checkStatus, 4000);

    return () => {
      active = false;
      clearInterval(interval);
      if (autoDismissTimerRef.current) {
        window.clearTimeout(autoDismissTimerRef.current);
      }
    };
  }, []);

  if (!toast || !visible) return null;

  // Visual tones based on toast type
  const styleTones = {
    success: {
      border: "border-emerald-500/30 bg-[#0c1813]/95 shadow-emerald-950/20 text-emerald-100",
      iconColor: "text-emerald-400 bg-emerald-500/10",
      buttonHover: "hover:bg-emerald-500/10",
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
        </svg>
      ),
    },
    error: {
      border: "border-rose-500/30 bg-[#1a0f11]/95 shadow-rose-950/20 text-rose-100",
      iconColor: "text-rose-400 bg-rose-500/10",
      buttonHover: "hover:bg-rose-500/10",
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      ),
    },
    warning: {
      border: "border-amber-500/30 bg-[#1a150f]/95 shadow-amber-950/20 text-amber-100",
      iconColor: "text-amber-400 bg-amber-500/10",
      buttonHover: "hover:bg-amber-500/10",
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      ),
    },
    info: {
      border: "border-sky-500/30 bg-[#0e161a]/95 shadow-sky-950/20 text-sky-100",
      iconColor: "text-sky-400 bg-sky-500/10",
      buttonHover: "hover:bg-sky-500/10",
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
  }[toast.type];

  return (
    <div className={`fixed top-5 right-5 z-[70] flex w-[min(calc(100vw-2.5rem),380px)] items-start gap-4 rounded-xl border p-4 shadow-2xl backdrop-blur-md transition-all duration-300 transform translate-y-0 opacity-100 ${styleTones.border}`}>
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${styleTones.iconColor}`}>
        {styleTones.icon}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-bold text-sm leading-5">{toast.title}</h3>
        <p className="mt-1 text-xs opacity-80 leading-relaxed">{toast.message}</p>
      </div>
      <button
        aria-label="Dismiss status notification"
        className={`grid h-6 w-6 shrink-0 place-items-center rounded-md border border-white/15 bg-white/5 text-slate-400 transition hover:text-white ${styleTones.buttonHover}`}
        onClick={() => setVisible(false)}
        type="button"
      >
        <span className="text-xs font-semibold">×</span>
      </button>
    </div>
  );
}
