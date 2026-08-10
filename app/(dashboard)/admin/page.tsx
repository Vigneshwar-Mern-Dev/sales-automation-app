import Link from "next/link";
import { db } from "@/app/lib/db";
import { CallLeadStatus, TaskStatus, WhatsAppLeadStatus } from "@/app/lib/prisma-enums";

function formatDate(value: Date | null) {
  if (!value) {
    return "Never";
  }

  return value.toLocaleString("en-IN", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
  });
}

async function getOverviewData() {
  try {
    const openCallStatuses = [
      CallLeadStatus.NEW,
      CallLeadStatus.CONTACTED,
      CallLeadStatus.FOLLOW_UP,
      CallLeadStatus.INTERESTED,
      CallLeadStatus.NO_RESPONSE,
    ];

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [
      totalUsers,
      adminUsers,
      openTasks,
      overdueTasks,
      openCallLeads,
      unassignedCallLeads,
      callFollowUps,
      recentCallLeads,
      waSentToday,
      waQueued,
      waReplied,
    ] = await Promise.all([
      db.user.count(),
      db.user.count({ where: { role: "ADMIN" } }),
      db.task.count({
        where: { status: { in: [TaskStatus.PENDING, TaskStatus.IN_PROGRESS] } },
      }),
      db.task.count({
        where: {
          dueDate: { lt: new Date() },
          status: { notIn: [TaskStatus.COMPLETED, TaskStatus.CANCELLED] },
        },
      }),
      db.callLead.count({ where: { status: { in: openCallStatuses }, deletedAt: null, isArchived: false } }),
      db.callLead.count({
        where: { assignedToId: null, status: { in: openCallStatuses }, deletedAt: null, isArchived: false },
      }),
      db.callFollowUp.count({ where: { completedAt: null } }),
      db.callLead.findMany({
        where: { deletedAt: null, isArchived: false },
        orderBy: { createdAt: "desc" },
        take: 6,
        select: {
          id: true,
          displayName: true,
          phone: true,
          status: true,
          assignedTo: { select: { username: true } },
          createdAt: true,
        },
      }),
      db.whatsAppQueueItem.count({ where: { sentAt: { gte: todayStart }, deletedAt: null, isArchived: false } }),
      db.whatsAppQueueItem.count({ where: { status: { in: ["QUEUED", "SENDING"] }, deletedAt: null, isArchived: false } }),
      db.whatsAppLead.count({ where: { OR: [{ status: WhatsAppLeadStatus.REPLIED }, { lastReplyAt: { not: null } }], deletedAt: null, isArchived: false } }),
    ]);

    const standardUsers = totalUsers - adminUsers;

    return {
      data: {
        totalUsers,
        adminUsers,
        standardUsers,
        openTasks,
        overdueTasks,
        openCallLeads,
        unassignedCallLeads,
        callFollowUps,
        recentCallLeads,
        waQueued,
        waSentToday,
        waReplied,
      },
      error: null,
    };
  } catch {
    return {
      data: {
        totalUsers: 0,
        adminUsers: 0,
        standardUsers: 0,
        openTasks: 0,
        overdueTasks: 0,
        openCallLeads: 0,
        unassignedCallLeads: 0,
        callFollowUps: 0,
        recentCallLeads: [],
        waQueued: 0,
        waSentToday: 0,
        waReplied: 0,
      },
      error: "Database is unreachable. Dashboard numbers are temporarily unavailable.",
    };
  }
}

export default async function AdminDashboard() {
  const { data, error } = await getOverviewData();

  return (
    <div className="space-y-6 pb-8">
      {/* Hero header */}
      <section className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-cyan-300/[0.08] via-white/[0.02] to-transparent p-6 md:p-8">
        <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="relative flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-cyan-300">
              MAKT CRM - Admin
            </p>
            <h1 className="mt-3 text-4xl font-black tracking-tight text-white md:text-5xl">
              Dashboard
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">
              Platform access, task risk, WhatsApp automation, and call center activity in one place.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link className="h-10 rounded-xl border border-cyan-300/30 bg-cyan-300/15 px-4 text-sm font-bold leading-10 text-cyan-100 transition hover:bg-cyan-300/25" href="/admin/calls/leads">
              Call Leads
            </Link>
            <Link className="h-10 rounded-xl border border-white/10 px-4 text-sm font-semibold leading-10 text-slate-200 transition hover:bg-white/10" href="/admin/tasks">
              Tasks
            </Link>
            <Link className="h-10 rounded-xl border border-white/10 px-4 text-sm font-semibold leading-10 text-slate-200 transition hover:bg-white/10" href="/admin/analytics">
              Analytics
            </Link>
            <Link className="h-10 rounded-xl border border-emerald-300/30 bg-emerald-300/15 px-4 text-sm font-bold leading-10 text-emerald-100 transition hover:bg-emerald-300/25" href="/admin/whatsapp">
              WhatsApp
            </Link>
            <Link className="h-10 rounded-xl border border-white/10 px-4 text-sm font-semibold leading-10 text-slate-300 transition hover:bg-white/10" href="/admin/audit">
              Audit Log
            </Link>
          </div>
        </div>
      </section>

      {error ? (
        <div className="rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
          {error}
        </div>
      ) : null}

      {/* KPI cards */}
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {([
          { 
            label: "Open call leads", 
            value: data.openCallLeads, 
            detail: "Needs operator action", 
            icon: "Calls",
            accent: "from-cyan-400/[0.05]", 
            border: "border-cyan-500/10", 
            tone: "text-cyan-300", 
            hoverStyle: "hover:border-cyan-400/50 hover:shadow-[0_0_30px_rgba(34,211,238,0.15)] group-hover:bg-cyan-400/20" 
          },
          { 
            label: "Unassigned", 
            value: data.unassignedCallLeads, 
            detail: "No owner assigned", 
            icon: "Owner",
            accent: "from-sky-400/[0.05]", 
            border: "border-sky-500/10", 
            tone: "text-sky-300", 
            hoverStyle: "hover:border-sky-400/50 hover:shadow-[0_0_30px_rgba(56,189,248,0.15)] group-hover:bg-sky-400/20" 
          },
          { 
            label: "Follow-ups", 
            value: data.callFollowUps, 
            detail: "Open callback work", 
            icon: "Due",
            accent: "from-amber-400/[0.05]", 
            border: "border-amber-500/10", 
            tone: "text-amber-300", 
            hoverStyle: "hover:border-amber-400/50 hover:shadow-[0_0_30px_rgba(251,191,36,0.15)] group-hover:bg-amber-400/20" 
          },
          { 
            label: "Open tasks", 
            value: data.openTasks, 
            detail: `${data.overdueTasks} overdue`, 
            icon: "Tasks",
            accent: "from-rose-400/[0.05]", 
            border: "border-rose-500/10", 
            tone: "text-rose-300", 
            hoverStyle: "hover:border-rose-400/50 hover:shadow-[0_0_30px_rgba(251,113,133,0.15)] group-hover:bg-rose-400/20" 
          },
        ] as const).map(({ label, value, detail, icon, accent, border, tone, hoverStyle }) => (
          <div 
            key={label} 
            className={`group relative overflow-hidden rounded-2xl border ${border} bg-gradient-to-br ${accent} to-transparent p-6 backdrop-blur-md transition-all duration-300 hover:scale-[1.02] hover:-translate-y-0.5 ${hoverStyle}`}
          >
            {/* Ambient background light flare */}
            <div className="pointer-events-none absolute -left-12 -top-12 h-24 w-24 rounded-full bg-white/[0.02] blur-xl transition-all duration-500 group-hover:scale-150" />
            
            <div className="relative flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-slate-400">{label}</p>
                <p className={`mt-3 text-5xl font-black tracking-tight ${tone}`}>{value}</p>
                <p className="mt-2 text-xs text-slate-500">{detail}</p>
              </div>
              <span className="text-xs font-bold uppercase tracking-wide opacity-60 transition-transform duration-300 group-hover:scale-110">{icon}</span>
            </div>
          </div>
        ))}
      </section>

      {/* WhatsApp panel */}
      <section className="group relative overflow-hidden rounded-2xl border border-emerald-500/15 bg-gradient-to-br from-emerald-500/[0.03] via-white/[0.01] to-transparent p-6 backdrop-blur-md transition-all duration-300 hover:border-emerald-400/40 hover:shadow-[0_0_35px_rgba(16,185,129,0.08)]">
        <div className="pointer-events-none absolute -bottom-12 -right-12 h-40 w-40 rounded-full bg-emerald-400/5 blur-3xl transition-all duration-500 group-hover:scale-110" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <span className="animate-pulse h-2 w-2 rounded-full bg-emerald-400 inline-block" />
              WhatsApp automation
            </h2>
            <p className="mt-1 text-sm text-slate-400">Today&apos;s outbound messaging snapshot</p>
          </div>
          <div className="flex gap-2">
            <Link className="h-9 rounded-xl border border-white/10 px-4 text-xs font-semibold leading-9 text-slate-200 transition-all duration-200 hover:bg-white/10 hover:border-white/25" href="/admin/whatsapp">
              View panel
            </Link>
          </div>
        </div>
        <div className="relative mt-5 grid gap-3 sm:grid-cols-3">
          {([
            { label: "Queued", value: data.waQueued, tone: "text-cyan-300", bg: "bg-cyan-500/[0.02] border-cyan-500/10 hover:border-cyan-400/30 hover:shadow-[0_0_20px_rgba(34,211,238,0.06)]" },
            { label: "Sent today", value: data.waSentToday, tone: "text-emerald-300", bg: "bg-emerald-500/[0.02] border-emerald-500/10 hover:border-emerald-400/30 hover:shadow-[0_0_20px_rgba(16,185,129,0.06)]" },
            { label: "Replied", value: data.waReplied, tone: "text-violet-300", bg: "bg-violet-500/[0.02] border-violet-500/10 hover:border-violet-400/30 hover:shadow-[0_0_20px_rgba(139,92,246,0.06)]" },
          ] as const).map(({ label, value, tone, bg }) => (
            <div key={label} className={`rounded-xl border ${bg} p-5 transition-all duration-300 hover:scale-[1.01]`}>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{label}</p>
              <p className={`mt-3 text-4xl font-black ${tone}`}>{value}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Recent leads and user summary */}
      <section className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
        {/* Recent call leads */}
        <div className="group rounded-2xl border border-white/10 bg-white/[0.01] p-6 backdrop-blur-md transition-all duration-300 hover:border-white/15 hover:shadow-[0_0_25px_rgba(255,255,255,0.02)]">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-white">Recent call leads</h2>
              <p className="mt-0.5 text-xs text-slate-500">Latest call records from the call center</p>
            </div>
            <Link className="h-8 rounded-lg border border-white/10 px-4 text-xs font-bold leading-8 text-slate-200 transition-all duration-200 hover:bg-white/10 hover:border-white/20" href="/admin/calls/leads">
              View all
            </Link>
          </div>

          <div className="mt-4 divide-y divide-white/[0.06]">
            {data.recentCallLeads.map((lead) => {
              const tone =
                lead.status === "CONVERTED" ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
                : lead.status === "FOLLOW_UP" || lead.status === "INTERESTED" ? "border-amber-500/20 bg-amber-500/10 text-amber-300"
                : lead.status === "NOT_INTERESTED" ? "border-rose-500/20 bg-rose-500/10 text-rose-300"
                : "border-cyan-500/20 bg-cyan-500/10 text-cyan-300";
              return (
                <div className="flex items-center justify-between gap-3 py-3.5 transition-all duration-200 hover:bg-white/[0.01] px-2 rounded-xl" key={lead.id}>
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/5 border border-white/10 text-xs font-bold text-slate-300 shadow-inner">
                      {(lead.displayName || "?").slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white">
                        {lead.displayName || lead.phone || "Unknown caller"}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {lead.assignedTo?.username || "Unassigned"} - {formatDate(lead.createdAt)}
                      </p>
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-lg border px-2.5 py-1 text-xs font-bold ${tone}`}>
                    {lead.status.replace(/_/g, " ")}
                  </span>
                </div>
              );
            })}
            {!data.recentCallLeads.length ? (
              <p className="py-6 text-center text-sm text-slate-500">No call leads yet.</p>
            ) : null}
          </div>
        </div>

        {/* Access summary + quick links */}
        <div className="space-y-4">
          <div className="group rounded-2xl border border-white/10 bg-white/[0.01] p-6 backdrop-blur-md transition-all duration-300 hover:border-white/15 hover:shadow-[0_0_25px_rgba(255,255,255,0.02)]">
            <h2 className="text-base font-bold text-white">Access summary</h2>
            <div className="mt-4 space-y-2.5">
              {([
                ["Total users", data.totalUsers, "text-white border-white/5 bg-white/[0.01]"],
                ["Admins", data.adminUsers, "text-rose-300 border-rose-500/5 bg-rose-500/[0.01]"],
                ["Agents", data.standardUsers, "text-cyan-300 border-cyan-500/5 bg-cyan-500/[0.01]"],
              ] as const).map(([label, value, tone]) => (
                <div key={label} className={`flex items-center justify-between rounded-xl border px-4 py-3.5 ${tone}`}>
                  <p className="text-sm text-slate-400">{label}</p>
                  <p className="text-2xl font-black tracking-tight">{value}</p>
                </div>
              ))}
            </div>
            <Link className="mt-4 flex h-10 items-center justify-center rounded-xl border border-white/10 text-sm font-semibold text-slate-200 transition-all duration-200 hover:bg-white/10 hover:border-white/20" href="/admin/users">
              Manage users
            </Link>
          </div>

          <div className="group rounded-2xl border border-white/10 bg-white/[0.01] p-6 backdrop-blur-md transition-all duration-300 hover:border-white/15 hover:shadow-[0_0_25px_rgba(255,255,255,0.02)]">
            <h2 className="text-base font-bold text-white">Quick links</h2>
            <div className="mt-3 space-y-2">
              {([
                ["/admin/analytics", "Analytics"],
                ["/admin/audit", "Audit Log"],
                ["/admin/calls/missed", "Callbacks"],
                ["/admin/whatsapp/leads", "WhatsApp Leads"],
              ] as const).map(([href, label]) => (
                <Link key={href} href={href} className="flex h-10 items-center rounded-xl border border-white/5 bg-black/10 px-4 text-sm font-semibold text-slate-300 transition-all duration-200 hover:border-white/10 hover:bg-white/[0.04] hover:text-white">
                  {label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}


