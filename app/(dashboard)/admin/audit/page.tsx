import { db } from "@/app/lib/db";

function formatDate(value: Date) {
  return value.toLocaleString("en-IN", { day: "2-digit", hour: "2-digit", minute: "2-digit", month: "short", year: "numeric" });
}

function timeAgo(value: Date) {
  const ms = Date.now() - value.getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function actionTone(actionType: string) {
  if (actionType.includes("MISSED") || actionType.includes("DELETE")) return "border-rose-300/20 bg-rose-300/10 text-rose-200";
  if (actionType.includes("ANSWERED") || actionType.includes("COMPLETED") || actionType.includes("CONVERTED")) return "border-emerald-300/20 bg-emerald-300/10 text-emerald-200";
  if (actionType.includes("ASSIGNMENT")) return "border-amber-300/20 bg-amber-300/10 text-amber-200";
  if (actionType.includes("NOTE") || actionType.includes("FOLLOW")) return "border-violet-300/20 bg-violet-300/10 text-violet-200";
  return "border-white/10 bg-white/5 text-slate-300";
}

function actionIcon(actionType: string) {
  if (actionType.includes("RINGING")) return "📞";
  if (actionType.includes("ANSWERED")) return "✅";
  if (actionType.includes("MISSED")) return "❌";
  if (actionType.includes("COMPLETED")) return "🏁";
  if (actionType.includes("ASSIGNMENT")) return "👤";
  if (actionType.includes("NOTE")) return "📝";
  if (actionType.includes("FOLLOW")) return "🔔";
  if (actionType.includes("CREATION")) return "✨";
  return "🔄";
}

type AuditPageProps = { searchParams: Promise<{ page?: string }> };

const PAGE_SIZE = 50;

export default async function AuditLogPage({ searchParams }: AuditPageProps) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10));
  const skip = (page - 1) * PAGE_SIZE;

  const [activities, total] = await Promise.all([
    db.callActivity.findMany({
      orderBy: { createdAt: "desc" },
      skip,
      take: PAGE_SIZE,
      select: {
        id: true,
        actionType: true,
        description: true,
        createdAt: true,
        user: { select: { username: true } },
        lead: { select: { displayName: true, phone: true } },
      },
    }),
    db.callActivity.count(),
  ]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <section className="flex flex-col justify-between gap-4 rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-transparent p-5 md:flex-row md:items-center">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">System</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-white md:text-4xl">Audit log</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            Full history of call events, status changes, assignments, and notes across all leads.
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-5 py-3 text-center">
          <p className="text-2xl font-black text-white">{total.toLocaleString("en-IN")}</p>
          <p className="mt-1 text-xs text-slate-400">Total events</p>
        </div>
      </section>

      {/* Log table */}
      <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[740px] text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-white/[0.02] text-xs uppercase tracking-[0.16em] text-slate-500">
                <th className="px-5 py-4">Event</th>
                <th className="px-5 py-4">Lead</th>
                <th className="px-5 py-4">Actor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {activities.map((activity: {
                id: string;
                actionType: string;
                description: string;
                createdAt: Date;
                user: { username: string } | null;
                lead: { displayName: string; phone: string } | null;
              }) => (
                <tr key={activity.id} className="transition hover:bg-white/[0.02]">
                  <td className="px-5 py-4">
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 text-base leading-none">{actionIcon(activity.actionType)}</span>
                      <div>
                        <span className={`inline-block rounded border px-2 py-0.5 text-[11px] font-bold ${actionTone(activity.actionType)}`}>
                          {activity.actionType.replace(/_/g, " ")}
                        </span>
                        <p className="mt-1.5 max-w-sm text-xs leading-5 text-slate-400">{activity.description}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <p className="font-semibold text-white">{activity.lead?.displayName ?? "—"}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{activity.lead?.phone ?? ""}</p>
                  </td>
                  <td className="px-5 py-4">
                    {activity.user ? (
                      <span className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs font-semibold text-slate-300">
                        {activity.user.username}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-600">System</span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <p className="text-sm text-slate-300">{timeAgo(activity.createdAt)}</p>
                    <p className="mt-0.5 text-xs text-slate-600">{formatDate(activity.createdAt)}</p>
                  </td>
                </tr>
              ))}
              {!activities.length && (
                <tr><td colSpan={4} className="px-5 py-12 text-center text-slate-500">No audit events recorded yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-slate-500">
            Page {page} of {totalPages} — {total.toLocaleString("en-IN")} events
          </p>
          <div className="flex gap-2">
            {page > 1 && (
              <a href={`/admin/audit?page=${page - 1}`} className="h-10 rounded-lg border border-white/10 px-4 text-sm font-semibold leading-10 text-slate-200 transition hover:bg-white/10">
                ← Previous
              </a>
            )}
            {page < totalPages && (
              <a href={`/admin/audit?page=${page + 1}`} className="h-10 rounded-lg border border-cyan-300/20 bg-cyan-300/10 px-4 text-sm font-semibold leading-10 text-cyan-100 transition hover:bg-cyan-300/15">
                Next →
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
