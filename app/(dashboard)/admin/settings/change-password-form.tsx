"use client";

import { useRef, useState } from "react";
import { changePasswordAction } from "@/app/lib/settings-actions";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/app/lib/password-policy";

export function ChangePasswordForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ error?: string; success?: boolean } | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setResult(null);

    const formData = new FormData(e.currentTarget);
    const res = await changePasswordAction(formData);
    setResult(res ?? null);

    if (res?.success) {
      formRef.current?.reset();
    }

    setPending(false);
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="mt-5 grid gap-4">
      {result?.error && (
        <div className="rounded-lg border border-rose-300/20 bg-rose-300/10 px-4 py-3 text-sm text-rose-100">
          {result.error}
        </div>
      )}
      {result?.success && (
        <div className="rounded-lg border border-emerald-300/20 bg-emerald-300/10 px-4 py-3 text-sm text-emerald-100">
          Password updated successfully.
        </div>
      )}

      <label className="block">
        <span className="mb-2 block text-sm text-slate-400">Current password</span>
        <input
          autoComplete="current-password"
          className="h-11 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-cyan-300"
          name="currentPassword"
          required
          type="password"
        />
      </label>

      <label className="block">
        <span className="mb-2 block text-sm text-slate-400">New password</span>
        <input
          autoComplete="new-password"
          className="h-11 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-cyan-300"
          minLength={PASSWORD_MIN_LENGTH}
          maxLength={PASSWORD_MAX_LENGTH}
          name="newPassword"
          required
          type="password"
        />
      </label>

      <label className="block">
        <span className="mb-2 block text-sm text-slate-400">Confirm new password</span>
        <input
          autoComplete="new-password"
          className="h-11 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-cyan-300"
          minLength={PASSWORD_MIN_LENGTH}
          maxLength={PASSWORD_MAX_LENGTH}
          name="confirmPassword"
          required
          type="password"
        />
      </label>

      <button
        className="h-11 w-fit rounded-lg bg-cyan-300 px-6 text-sm font-bold text-slate-950 transition hover:bg-cyan-200 disabled:opacity-50"
        disabled={pending}
        type="submit"
      >
        {pending ? "Saving…" : "Change password"}
      </button>
    </form>
  );
}
