import { getWhatsAppAccounts, ensureWhatsAppAccount, saveWhatsAppSettingsAction } from "@/app/lib/whatsapp-actions";
import { MessageVariantsEditor } from "./MessageVariantsEditor";

const ACCOUNT_COLORS = [
  { border: "border-cyan-400/30", accent: "text-cyan-300", badge: "bg-cyan-400/15 text-cyan-300 border-cyan-400/30" },
  { border: "border-violet-400/30", accent: "text-violet-300", badge: "bg-violet-400/15 text-violet-300 border-violet-400/30" },
  { border: "border-amber-400/30", accent: "text-amber-300", badge: "bg-amber-400/15 text-amber-300 border-amber-400/30" },
  { border: "border-rose-400/30", accent: "text-rose-300", badge: "bg-rose-400/15 text-rose-300 border-rose-400/30" },
];

export default async function AdminWhatsAppSettingsPage() {
  await ensureWhatsAppAccount();
  const accounts = await getWhatsAppAccounts();

  return (
    <div className="space-y-6 pb-8">
      <section className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200">
          WhatsApp
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-white md:text-4xl">
          WhatsApp settings
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
          Configure sending limits, anti-ban protections, warmup mode, quiet hours, and message variants for each account.
        </p>
      </section>

      {accounts.map((account, index) => {
        const colors = ACCOUNT_COLORS[index % ACCOUNT_COLORS.length];
        const warmupEffectiveCap =
          account.warmupEnabled && account.warmupStartDate
            ? Math.min(
                account.dailySendLimit,
                Math.max(
                  1,
                  Math.floor((new Date().getTime() - account.warmupStartDate.getTime()) / 86_400_000) *
                    account.warmupRampPerDay,
                ),
              )
            : null;

        return (
          <div key={account.id} className={`rounded-xl border ${colors.border} p-1`}>
            <details open={index === 0}>
              <summary className="flex cursor-pointer items-center gap-3 rounded-lg p-4 hover:bg-white/[0.02]">
                <span className={`rounded border px-2 py-0.5 text-[10px] font-bold ${colors.badge}`}>
                  Account {index + 1}
                </span>
                <span className="text-base font-semibold text-white">{account.label}</span>
                <span className="text-xs text-slate-500">{account.phoneNumber || "Not connected"}</span>
                <span className="ml-auto font-mono text-[10px] text-slate-600">{account.id}</span>
              </summary>

              <form action={saveWhatsAppSettingsAction} className="space-y-6 p-4 pt-0">
                <input name="accountId" type="hidden" value={account.id} />

                {/* ── General ─────────────────────────────────────────────────────── */}
                <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
                  <h2 className="text-base font-semibold text-white">General</h2>
                  <div className="mt-4 grid gap-4 xl:grid-cols-2">
                    <label className="block">
                      <span className="mb-2 block text-sm text-slate-400">Account label</span>
                      <input className="h-11 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-cyan-300" defaultValue={account.label} name="label" />
                    </label>
                    <label className="block">
                      <span className="mb-2 block text-sm text-slate-400">Daily send cap</span>
                      <input className="h-11 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-cyan-300" defaultValue={account.dailySendLimit} max={300} min={1} name="dailySendLimit" type="number" />
                    </label>
                    <div className="xl:col-span-2 block rounded-lg border border-cyan-300/10 bg-cyan-300/5 p-4 mt-2">
                      <p className="text-sm font-semibold text-cyan-200">
                        Durable scheduled delivery
                      </p>
                      <p className="mt-1 text-xs text-slate-400 leading-relaxed">
                        Messages use the delay and quiet-hour settings below. Their scheduled send time is saved, so refreshes and worker restarts do not reset the queue ETA.
                      </p>
                    </div>
                  </div>

                  <label className="mt-4 flex items-center gap-3 rounded-lg border border-emerald-300/20 bg-emerald-300/10 p-3 text-sm text-emerald-100">
                    <input className="h-4 w-4 accent-emerald-400" defaultChecked={account.autoReplyEnabled} name="autoReplyEnabled" type="checkbox" />
                    <span>
                      <strong>Auto-reply on incoming call</strong>
                      <span className="ml-2 text-emerald-200/70">— automatically queue WhatsApp message for every incoming caller</span>
                    </span>
                  </label>

                  <label className="mt-3 flex items-center gap-3 rounded-lg border border-white/10 bg-black/20 p-3 text-sm text-slate-300">
                    <input className="h-4 w-4 accent-cyan-300" defaultChecked={account.requireOptIn} name="requireOptIn" type="checkbox" />
                    Require opt-in before a lead can be queued (manual leads only)
                  </label>
                </div>

                {/* ── Send Timing ─────────────────────────────────────────────────── */}
                <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
                  <h2 className="text-base font-semibold text-white">Send timing</h2>
                  <p className="mt-1 text-sm text-slate-400">Randomised delay between messages. Wider window = more human-like.</p>
                  <div className="mt-4 grid gap-4 xl:grid-cols-2">
                    <label className="block">
                      <span className="mb-2 block text-sm text-slate-400">Min delay (seconds)</span>
                      <input className="h-11 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-cyan-300" defaultValue={account.minDelaySeconds} min={30} name="minDelaySeconds" type="number" />
                    </label>
                    <label className="block">
                      <span className="mb-2 block text-sm text-slate-400">Max delay (seconds)</span>
                      <input className="h-11 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-cyan-300" defaultValue={account.maxDelaySeconds} min={30} name="maxDelaySeconds" type="number" />
                    </label>
                    <label className="block">
                      <span className="mb-2 block text-sm text-slate-400">Hourly send limit</span>
                      <input className="h-11 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-cyan-300" defaultValue={account.hourlySendLimit} max={60} min={1} name="hourlySendLimit" type="number" />
                    </label>
                    <label className="block">
                      <span className="mb-2 block text-sm text-slate-400">
                        Contact cooldown (days)
                        <span className="ml-1 text-slate-500">— don&apos;t re-message same contact within N days</span>
                      </span>
                      <input className="h-11 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-cyan-300" defaultValue={account.contactCooldownDays} min={0} name="contactCooldownDays" type="number" />
                    </label>
                  </div>
                </div>

                {/* ── Anti-Ban Protections ─────────────────────────────────────────── */}
                <div className="rounded-lg border border-rose-300/10 bg-rose-300/5 p-5">
                  <h2 className="text-base font-semibold text-white">Anti-ban protections</h2>
                  <p className="mt-1 text-sm text-slate-400">Automatically pause sending if Meta is rate-limiting or rejecting messages.</p>

                  <div className="mt-4 grid gap-4 xl:grid-cols-2">
                    <label className="block">
                      <span className="mb-2 block text-sm text-slate-400">
                        Auto-pause threshold
                        <span className="ml-1 text-slate-500">— pause after N consecutive failures</span>
                      </span>
                      <input className="h-11 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-cyan-300" defaultValue={account.autoPauseThreshold} min={1} max={20} name="autoPauseThreshold" type="number" />
                    </label>
                  </div>

                  <div className="mt-4 rounded-lg border border-amber-300/20 bg-amber-300/10 p-4 text-sm leading-6 text-amber-100">
                    When this account is auto-paused, go to the control panel, fix the issue, then click <strong>Resume</strong> to reset the failure counter and resume sending.
                  </div>
                </div>

                {/* ── Warmup Mode ──────────────────────────────────────────────────── */}
                <div className="rounded-lg border border-violet-300/10 bg-violet-300/5 p-5">
                  <h2 className="text-base font-semibold text-white">Number warmup mode</h2>
                  <p className="mt-1 text-sm text-slate-400">
                    Gradually ramp up sends for a new number. Protects fresh SIMs from immediate bans.
                  </p>

                  <label className="mt-4 flex items-center gap-3 rounded-lg border border-violet-300/20 bg-violet-300/10 p-3 text-sm text-violet-100">
                    <input className="h-4 w-4 accent-violet-400" defaultChecked={account.warmupEnabled} name="warmupEnabled" type="checkbox" />
                    <span>
                      <strong>Enable warmup mode</strong>
                      <span className="ml-2 text-violet-200/70">
                        — daily cap increases by ramp/day starting from today
                        {account.warmupEnabled && account.warmupStartDate
                          ? ` (started ${account.warmupStartDate.toLocaleDateString("en-IN")})`
                          : ""}
                      </span>
                    </span>
                  </label>

                  <div className="mt-4 grid gap-4 xl:grid-cols-2">
                    <label className="block">
                      <span className="mb-2 block text-sm text-slate-400">
                        Ramp per day
                        <span className="ml-1 text-slate-500">— messages added to cap each day</span>
                      </span>
                      <input className="h-11 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-cyan-300" defaultValue={account.warmupRampPerDay} min={1} max={20} name="warmupRampPerDay" type="number" />
                    </label>
                    {account.warmupEnabled && account.warmupStartDate ? (
                      <div className="flex flex-col justify-center rounded-lg border border-white/5 bg-black/20 px-4 py-3 text-sm">
                        <p className="text-slate-400">Today&apos;s effective cap</p>
                        <p className="mt-1 text-lg font-bold text-violet-200">
                          {warmupEffectiveCap}{" "}
                          <span className="text-sm font-normal text-slate-400">/ {account.dailySendLimit} max</span>
                        </p>
                      </div>
                    ) : null}
                  </div>
                </div>

                {/* ── Message Variants ─────────────────────────────────────────────── */}
                <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
                  <h2 className="text-base font-semibold text-white">Message variants</h2>
                  <p className="mt-1 text-sm text-slate-400">
                    Paste a different message in each column below.
                    Each contact receives a randomly selected variant.
                  </p>
                  <MessageVariantsEditor defaultValue={account.messageVariants ?? ""} />
                </div>

                <button className="h-11 rounded-lg bg-cyan-300 px-6 text-sm font-bold text-slate-950 transition hover:bg-cyan-200" type="submit">
                  Save settings for {account.label}
                </button>
              </form>
            </details>
          </div>
        );
      })}

      {/* Bridge info */}
      <section className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
        <h2 className="text-lg font-semibold text-white">Bridge endpoint</h2>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          Each account needs its own worker process. Set <code className="rounded bg-black/40 px-1 text-cyan-100">WHATSAPP_ACCOUNT_ID</code> to the account ID shown above.
        </p>
        <div className="mt-4 rounded-lg border border-white/10 bg-black/30 p-4 font-mono text-xs leading-6 text-slate-300">
          <p>$env:WHATSAPP_ACCOUNT_ID=&quot;account-id-from-above&quot;</p>
          <p>$env:WHATSAPP_BRIDGE_TOKEN=&quot;your-long-random-token&quot;</p>
          <p>$env:CRM_BASE_URL=&quot;http://localhost:3000&quot;</p>
          <p>npm.cmd run whatsapp:worker</p>
        </div>
      </section>
    </div>
  );
}
