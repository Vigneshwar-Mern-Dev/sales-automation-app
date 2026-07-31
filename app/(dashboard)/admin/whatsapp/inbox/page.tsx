import { db } from "@/app/lib/db";
import { WhatsAppLeadStatus } from "@/app/lib/prisma-enums";

function formatDate(value: Date | null) {
  if (!value) return "—";
  return value.toLocaleString("en-IN", { day: "2-digit", hour: "2-digit", minute: "2-digit", month: "short" });
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

export default async function WhatsAppInboxPage() {
  const replies = await db.whatsAppLead.findMany({
    where: { status: WhatsAppLeadStatus.REPLIED },
    orderBy: { lastReplyAt: "desc" },
    take: 100,
    select: {
      id: true,
      displayName: true,
      phone: true,
      lastReplyAt: true,
      lastReplySnippet: true,
      lastSentAt: true,
      createdAt: true,
    },
  });

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayCount = replies.filter((r) => r.lastReplyAt && r.lastReplyAt >= todayStart).length;
  const thisWeekCount = replies.filter((r) => {
    if (!r.lastReplyAt) return false;
    const d = new Date(); d.setDate(d.getDate() - 7);
    return r.lastReplyAt >= d;
  }).length;

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <section className="flex flex-col justify-between gap-4 rounded-xl border border-violet-300/10 bg-gradient-to-br from-violet-300/[0.06] to-transparent p-5 md:flex-row md:items-center">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-violet-300">WhatsApp</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-white md:text-4xl">Inbox — Replies</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            Contacts who replied to your WhatsApp automation. Follow up with them directly.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-violet-300/20 bg-violet-300/10 px-5 py-3 text-center">
            <p className="text-2xl font-black text-violet-200">{todayCount}</p>
            <p className="mt-1 text-xs text-slate-400">Today</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-5 py-3 text-center">
            <p className="text-2xl font-black text-white">{thisWeekCount}</p>
            <p className="mt-1 text-xs text-slate-400">This week</p>
          </div>
        </div>
      </section>

      {replies.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 p-16 text-center">
          <p className="text-3xl">💬</p>
          <p className="mt-4 text-lg font-semibold text-white">No replies yet</p>
          <p className="mt-2 text-sm text-slate-400">When leads reply to your WhatsApp messages, they will appear here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {replies.map((reply) => {
            const replyDate = reply.lastReplyAt;
            const isToday = replyDate && replyDate >= todayStart;
            return (
              <div
                key={reply.id}
                className={`rounded-xl border p-5 transition hover:bg-white/[0.02] ${isToday ? "border-violet-300/20 bg-violet-300/[0.04]" : "border-white/10 bg-white/[0.03]"}`}
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-violet-300/20 text-sm font-bold text-violet-200">
                        {reply.displayName.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-semibold text-white">{reply.displayName}</p>
                        <p className="text-xs text-slate-500">{reply.phone}</p>
                      </div>
                      {isToday && (
                        <span className="rounded-full border border-violet-300/30 bg-violet-300/10 px-2 py-0.5 text-[11px] font-bold text-violet-200">
                          New today
                        </span>
                      )}
                    </div>

                    {reply.lastReplySnippet && (
                      <div className="mt-3 rounded-lg border border-violet-300/10 bg-violet-300/[0.06] px-4 py-3">
                        <p className="text-sm leading-6 text-violet-100">&ldquo;{reply.lastReplySnippet}&rdquo;</p>
                      </div>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-col gap-2 text-right">
                    <div>
                      <p className="text-xs text-slate-500">Replied</p>
                      <p className="mt-0.5 text-sm font-semibold text-violet-200">
                        {replyDate ? timeAgo(replyDate) : "—"}
                      </p>
                      <p className="text-xs text-slate-600">{formatDate(replyDate)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Our message sent</p>
                      <p className="text-xs text-slate-400">{formatDate(reply.lastSentAt)}</p>
                    </div>
                    <a
                      href={`https://wa.me/${reply.phone.replace(/\D/g, "")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-emerald-300/20 bg-emerald-300/10 px-3 text-xs font-bold text-emerald-100 transition hover:bg-emerald-300/15"
                    >
                      <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M5.5 19.2 6.4 16A7.6 7.6 0 1 1 9 18.1l-3.5 1.1Z" />
                      </svg>
                      Open in WhatsApp
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-center text-xs text-slate-600">
        Showing {replies.length} replied contacts. Older entries auto-archived when they re-enter the queue.
      </p>
    </div>
  );
}
