"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[error-page]", error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-black px-4 text-center text-white">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-rose-500/20 text-4xl">
        ⚠️
      </div>

      <h1 className="text-3xl font-bold tracking-tight">Something went wrong</h1>

      <p className="mt-3 max-w-md text-sm leading-relaxed text-slate-400">
        An unexpected error occurred. This has been logged automatically. Please try again or contact support if the problem persists.
      </p>

      {error.digest && (
        <p className="mt-2 font-mono text-xs text-slate-600">
          Error ID: {error.digest}
        </p>
      )}

      <div className="mt-8 flex items-center gap-3">
        <button
          className="h-11 rounded-xl bg-cyan-400 px-6 text-sm font-bold text-slate-900 transition hover:bg-cyan-300"
          onClick={reset}
          type="button"
        >
          Try again
        </button>
        <Link
          className="h-11 rounded-xl border border-white/10 px-6 text-sm font-semibold leading-[44px] text-slate-300 transition hover:bg-white/5"
          href="/"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}
