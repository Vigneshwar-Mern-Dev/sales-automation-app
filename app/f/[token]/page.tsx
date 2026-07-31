"use client";

import { useEffect, useState, use } from "react";
import { markFormOpenedAction, markFormStartedAction, submitFormAction } from "./actions";

export default function LeadFormPage({ params }: { params: Promise<{ token: string }> }) {
  const resolvedParams = use(params);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startedTracked, setStartedTracked] = useState(false);

  useEffect(() => {
    markFormOpenedAction(resolvedParams.token).catch(() => {});
  }, [resolvedParams.token]);

  function trackStarted() {
    if (startedTracked) {
      return;
    }

    setStartedTracked(true);
    markFormStartedAction(resolvedParams.token).catch(() => {});
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    
    try {
      const res = await submitFormAction(resolvedParams.token, formData);
      if (res.ok) {
        setSuccess(true);
      } else {
        setError(res.error || "Failed to submit form");
      }
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center rounded-2xl border border-white/10 bg-white/5 p-8 text-center backdrop-blur-sm">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20 text-3xl text-emerald-400">
          ✓
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Thank You!</h1>
        <p className="mt-2 text-slate-400">
          Your details have been received successfully. Our team will contact you shortly.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm sm:p-8">
      <div className="mb-8">
        <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-500/20 font-bold text-cyan-400">
          MAKT
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Contact Details</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          Please provide your details below so our team can assist you with the MAKT ATM Franchise.
        </p>
      </div>

      <form className="space-y-6" onChange={trackStarted} onFocus={trackStarted} onSubmit={handleSubmit}>
        <div className="space-y-4">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-300">
              Full Name <span className="text-rose-400">*</span>
            </span>
            <input
              required
              className="h-12 w-full rounded-xl border border-white/10 bg-black/50 px-4 text-white outline-none focus:border-cyan-400 focus:bg-white/5 focus:ring-1 focus:ring-cyan-400"
              maxLength={120}
              name="name"
              placeholder="e.g. Ramesh Kumar"
              type="text"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-300">
              City / Location <span className="text-rose-400">*</span>
            </span>
            <input
              required
              className="h-12 w-full rounded-xl border border-white/10 bg-black/50 px-4 text-white outline-none focus:border-cyan-400 focus:bg-white/5 focus:ring-1 focus:ring-cyan-400"
              maxLength={120}
              name="city"
              placeholder="e.g. Chennai"
              type="text"
            />
          </label>

          <div className="block">
            <span className="mb-3 block text-sm font-medium text-slate-300">
              Property Type <span className="text-rose-400">*</span>
            </span>
            <div className="grid grid-cols-2 gap-3">
              <label className="relative flex cursor-pointer rounded-xl border border-white/10 bg-black/50 p-4 transition-colors hover:bg-white/5 has-[:checked]:border-cyan-400 has-[:checked]:bg-cyan-400/10">
                <input required className="peer sr-only" name="propertyType" type="radio" value="OWN" />
                <div className="flex flex-col">
                  <span className="text-xl">🏠</span>
                  <span className="mt-2 font-medium text-white">Own Property</span>
                </div>
              </label>
              <label className="relative flex cursor-pointer rounded-xl border border-white/10 bg-black/50 p-4 transition-colors hover:bg-white/5 has-[:checked]:border-cyan-400 has-[:checked]:bg-cyan-400/10">
                <input required className="peer sr-only" name="propertyType" type="radio" value="RENTAL" />
                <div className="flex flex-col">
                  <span className="text-xl">🔑</span>
                  <span className="mt-2 font-medium text-white">Rental Property</span>
                </div>
              </label>
            </div>
          </div>

          <label className="block">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-slate-300">
                Google Maps Location <span className="text-rose-400">*</span>
              </span>
              <a
                className="text-xs text-cyan-400 hover:text-cyan-300 hover:underline"
                href="https://maps.google.com"
                rel="noopener noreferrer"
                target="_blank"
              >
                📍 Open Maps
              </a>
            </div>
            <textarea
              required
              className="h-24 w-full resize-none rounded-xl border border-white/10 bg-black/50 p-4 text-white outline-none focus:border-cyan-400 focus:bg-white/5 focus:ring-1 focus:ring-cyan-400"
              maxLength={2048}
              name="mapsLocation"
              placeholder="Paste Google Maps link here..."
            />
          </label>
        </div>

        {error && (
          <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-200">
            {error}
          </div>
        )}

        <button
          className="relative h-12 w-full overflow-hidden rounded-xl bg-cyan-400 px-6 font-bold text-slate-900 transition-all hover:bg-cyan-300 disabled:opacity-70"
          disabled={submitting}
          type="submit"
        >
          {submitting ? "Submitting..." : "Submit Details"}
        </button>
      </form>
    </div>
  );
}
