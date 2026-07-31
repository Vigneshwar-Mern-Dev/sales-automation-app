import { db } from "@/app/lib/db";
import { CallLeadStatus, TaskPriority, TaskStatus } from "@/app/lib/prisma-enums";
import {
  DailyCallsChart,
  LeadStatusDonut,
  TaskCompletionChart,
  WaDailySendsChart,
  type DailyCallPoint,
  type StatusPoint,
  type TaskTrendPoint,
  type WaDailyPoint,
} from "./charts";

const taskStatuses = [TaskStatus.PENDING, TaskStatus.IN_PROGRESS, TaskStatus.COMPLETED, TaskStatus.CANCELLED];
const callLeadStatuses = [
  CallLeadStatus.NEW, CallLeadStatus.CONTACTED, CallLeadStatus.FOLLOW_UP,
  CallLeadStatus.INTERESTED, CallLeadStatus.NOT_INTERESTED, CallLeadStatus.NO_RESPONSE,
  CallLeadStatus.CONVERTED, CallLeadStatus.CLOSED,
];

function label(value: string) {
  return value.toLowerCase().split("_").map((p) => p[0].toUpperCase() + p.slice(1)).join(" ");
}
function formatNumber(value: number) { return new Intl.NumberFormat("en-IN").format(value); }
function percent(value: number, total: number) { return total ? `${Math.round((value / total) * 100)}%` : "0%"; }
function barWidth(value: number, max: number) { return max ? `${Math.max(4, Math.round((value / max) * 100))}%` : "0%"; }

type Range = "all" | "month" | "week" | "3day" | "today";
function getDateRange(range: Range): Date | undefined {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (range === "today") return d;
  if (range === "3day") { d.setDate(d.getDate() - 3); return d; }
  if (range === "week") { d.setDate(d.getDate() - 7); return d; }
  if (range === "month") { d.setDate(1); return d; }
  return undefined;
}

// Generate last N days labels
function last14Days() {
  return Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (13 - i));
    return d.toISOString().slice(0, 10);
  });
}

type AnalyticsPageProps = { searchParams: Promise<{ range?: string }> };

async function getAnalyticsData(since?: Date) {
  const createdAtFilter = since ? { gte: since } : undefined;
  const days = last14Days();
  const start14 = new Date(); start14.setDate(start14.getDate() - 13); start14.setHours(0,0,0,0);

  try {
    const [
      taskStatusCounts, taskPriorityCounts, overdueTasks,
      callLeadStatusCounts, openFollowUps, users,
      callSessions14, waSent14, waReplied14, tasks14,
      topCities, propertyTypes, agentCallStats, agentCompletedTasks, locationSentCount,
    ] = await Promise.all([
      db.task.groupBy({ by: ["status"], _count: { _all: true }, where: createdAtFilter ? { createdAt: createdAtFilter } : undefined }),
      db.task.groupBy({ by: ["priority"], _count: { _all: true }, where: createdAtFilter ? { createdAt: createdAtFilter } : undefined }),
      db.task.count({ where: { dueDate: { lt: new Date() }, status: { notIn: [TaskStatus.COMPLETED, TaskStatus.CANCELLED] } } }),
      db.callLead.groupBy({ by: ["status"], _count: { _all: true }, where: createdAtFilter ? { createdAt: createdAtFilter } : undefined }),
      db.callFollowUp.count({ where: { completedAt: null } }),
      db.user.findMany({ orderBy: { username: "asc" }, select: { id: true, username: true, role: true, _count: { select: { assignedTasks: true, callLeads: true, callFollowUps: true } } } }),
      // Raw daily data for charts
      db.callSession.findMany({ where: { firstRingAt: { gte: start14 } }, select: { firstRingAt: true, callDirection: true } }),
      db.whatsAppLead.findMany({ where: { lastSentAt: { gte: start14 } }, select: { lastSentAt: true } }),
      db.whatsAppLead.findMany({ where: { lastReplyAt: { gte: start14 } }, select: { lastReplyAt: true } }),
      db.task.findMany({ where: { createdAt: { gte: start14 } }, select: { createdAt: true, status: true, updatedAt: true } }),
      // Lead Demographics & Stats
      db.callLead.groupBy({
        by: ["city"],
        _count: { _all: true },
        where: {
          NOT: [
            { city: null },
            { city: "" }
          ],
          createdAt: createdAtFilter ? { gte: since } : undefined,
        },
        orderBy: { _count: { city: "desc" } },
        take: 5,
      }),
      db.callLead.groupBy({
        by: ["ownershipType"],
        _count: { _all: true },
        where: {
          NOT: [
            { ownershipType: null },
            { ownershipType: "" }
          ],
          createdAt: createdAtFilter ? { gte: since } : undefined,
        },
      }),
      // Agent Productivity
      db.callSession.groupBy({
        by: ["assignedToId"],
        _count: { _all: true },
        _sum: { durationSeconds: true },
        where: {
          status: { in: ["ANSWERED", "COMPLETED"] },
          firstRingAt: createdAtFilter ? { gte: since } : undefined,
        },
      }),
      db.task.groupBy({
        by: ["assignedToId"],
        _count: { _all: true },
        where: {
          status: "COMPLETED",
          createdAt: createdAtFilter ? { gte: since } : undefined,
        },
      }),
      // Location link sent rate
      db.callLead.count({
        where: {
          locationSent: true,
          createdAt: createdAtFilter ? { gte: since } : undefined,
        },
      }),
    ]);

    // Build daily call chart data
    const callsByDay: Record<string, { incoming: number; outgoing: number }> = {};
    days.forEach((d) => { callsByDay[d] = { incoming: 0, outgoing: 0 }; });
    for (const s of callSessions14) {
      const day = new Date(s.firstRingAt).toISOString().slice(0, 10);
      if (callsByDay[day]) {
        if (s.callDirection === "INCOMING") callsByDay[day].incoming++;
        else callsByDay[day].outgoing++;
      }
    }
    const dailyCalls: DailyCallPoint[] = days.map((d) => ({ date: d.slice(5), ...callsByDay[d] }));

    // Build daily WA sends data
    const waSentByDay: Record<string, number> = {};
    const waRepliedByDay: Record<string, number> = {};
    days.forEach((d) => { waSentByDay[d] = 0; waRepliedByDay[d] = 0; });
    for (const w of waSent14) {
      const day = new Date(w.lastSentAt!).toISOString().slice(0, 10);
      if (waSentByDay[day] !== undefined) waSentByDay[day]++;
    }
    for (const w of waReplied14) {
      const day = new Date(w.lastReplyAt!).toISOString().slice(0, 10);
      if (waRepliedByDay[day] !== undefined) waRepliedByDay[day]++;
    }
    const dailyWa: WaDailyPoint[] = days.map((d) => ({ date: d.slice(5), sent: waSentByDay[d], replied: waRepliedByDay[d] }));

    // Build daily task activity
    const taskCreatedByDay: Record<string, number> = {};
    const taskCompletedByDay: Record<string, number> = {};
    days.forEach((d) => { taskCreatedByDay[d] = 0; taskCompletedByDay[d] = 0; });
    for (const t of tasks14) {
      const cDay = new Date(t.createdAt).toISOString().slice(0, 10);
      if (taskCreatedByDay[cDay] !== undefined) taskCreatedByDay[cDay]++;
      if (t.status === "COMPLETED") {
        const uDay = new Date(t.updatedAt).toISOString().slice(0, 10);
        if (taskCompletedByDay[uDay] !== undefined) taskCompletedByDay[uDay]++;
      }
    }
    const dailyTasks: TaskTrendPoint[] = days.map((d) => ({ date: d.slice(5), created: taskCreatedByDay[d], completed: taskCompletedByDay[d] }));

    return {
      data: {
        taskStatusCounts,
        taskPriorityCounts,
        overdueTasks,
        callLeadStatusCounts,
        openFollowUps,
        users,
        dailyCalls,
        dailyWa,
        dailyTasks,
        topCities,
        propertyTypes,
        agentCallStats,
        agentCompletedTasks,
        locationSentCount,
      },
      error: null,
    };
  } catch {
    return {
      data: {
        taskStatusCounts: [],
        taskPriorityCounts: [],
        overdueTasks: 0,
        callLeadStatusCounts: [],
        openFollowUps: 0,
        users: [],
        dailyCalls: [],
        dailyWa: [],
        dailyTasks: [],
        topCities: [],
        propertyTypes: [],
        agentCallStats: [],
        agentCompletedTasks: [],
        locationSentCount: 0,
      },
      error: "Database is unreachable. Analytics numbers are temporarily unavailable.",
    };
  }
}

const STATUS_COLORS: Record<string, string> = {
  NEW: "#67e8f9", CONTACTED: "#38bdf8", FOLLOW_UP: "#fbbf24",
  INTERESTED: "#4ade80", NOT_INTERESTED: "#f87171", NO_RESPONSE: "#94a3b8",
  CONVERTED: "#34d399", CLOSED: "#71717a",
};

function formatDuration(seconds: number | null) {
  if (!seconds) return "0s";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

export default async function AdminAnalyticsPage({ searchParams }: AnalyticsPageProps) {
  const params = await searchParams;
  const range: Range = (params.range === "week" || params.range === "month" || params.range === "3day" || params.range === "today") ? params.range : "all";
  const since = getDateRange(range);
  const { data, error } = await getAnalyticsData(since);

  const taskCounts = Object.fromEntries(taskStatuses.map((s) => [s, data.taskStatusCounts.find((r: { status: string; _count: { _all: number } }) => r.status === s)?._count._all ?? 0])) as Record<TaskStatus, number>;
  const callCounts = Object.fromEntries(callLeadStatuses.map((s) => [s, data.callLeadStatusCounts.find((r: { status: string; _count: { _all: number } }) => r.status === s)?._count._all ?? 0])) as Record<CallLeadStatus, number>;
  const totalTasks = Object.values(taskCounts).reduce((a, b) => a + b, 0);
  const totalCallLeads = Object.values(callCounts).reduce((a, b) => a + b, 0);
  const openTasks = taskCounts.PENDING + taskCounts.IN_PROGRESS;
  const openCallLeads = callCounts.NEW + callCounts.CONTACTED + callCounts.FOLLOW_UP + callCounts.INTERESTED + callCounts.NO_RESPONSE;
  const urgentTasks = (data.taskPriorityCounts.find((r: { priority: string; _count: { _all: number } }) => r.priority === TaskPriority.URGENT)?._count._all ?? 0) + (data.taskPriorityCounts.find((r: { priority: string; _count: { _all: number } }) => r.priority === TaskPriority.HIGH)?._count._all ?? 0);

  const donutData: StatusPoint[] = callLeadStatuses.map((s) => ({ name: label(s), value: callCounts[s], color: STATUS_COLORS[s] ?? "#64748b" })).filter((d) => d.value > 0);

  const rangeLabel = range === "today" ? "Today" : range === "3day" ? "Last 3 days" : range === "week" ? "This week" : range === "month" ? "This month" : "All time";

  const respondedLeads = totalCallLeads - (callCounts.NEW ?? 0) - (callCounts.NO_RESPONSE ?? 0);
  const responseRatePercent = percent(respondedLeads, totalCallLeads);
  const conversionRatePercent = percent(callCounts.CONVERTED ?? 0, totalCallLeads);
  const locationSentPercent = percent(data.locationSentCount ?? 0, totalCallLeads);

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <section className="flex flex-col justify-between gap-4 rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-transparent p-5 md:flex-row md:items-center">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">Analytics</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-white md:text-4xl">Operations analytics</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            Task load, call lead status, follow-up pressure, user workload — with live charts.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          {(["today", "3day", "week", "month", "all"] as const).map((r) => (
            <a key={r} href={r === "all" ? "/admin/analytics" : `/admin/analytics?range=${r}`}
              className={["h-10 rounded-lg border px-4 text-sm font-semibold leading-10 transition",
                range === r ? "border-cyan-300/30 bg-cyan-300/10 text-cyan-100" : "border-white/10 text-slate-300 hover:bg-white/10"].join(" ")}>
              {r === "today" ? "Today" : r === "3day" ? "Last 3 days" : r === "week" ? "This week" : r === "month" ? "This month" : "All time"}
            </a>
          ))}
        </div>
      </section>

      {error && <div className="rounded-lg border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">{error}</div>}

      <p className="text-xs text-slate-500">Showing: <span className="font-semibold text-slate-300">{rangeLabel}</span></p>

      {/* KPI Cards */}
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Open tasks", value: openTasks, detail: `${data.overdueTasks} overdue`, color: "text-rose-300", glow: "border-rose-300/10" },
          { label: "Urgent/high tasks", value: urgentTasks, detail: "Priority workload", color: "text-amber-300", glow: "border-amber-300/10" },
          { label: "Open call leads", value: openCallLeads, detail: `${percent(openCallLeads, totalCallLeads)} of total`, color: "text-cyan-300", glow: "border-cyan-300/10" },
          { label: "Open follow-ups", value: data.openFollowUps, detail: "Callbacks pending", color: "text-violet-300", glow: "border-violet-300/10" },
        ].map(({ label, value, detail, color, glow }) => (
          <div key={label} className={`rounded-xl border ${glow} bg-white/[0.03] p-5 transition hover:bg-white/[0.05]`}>
            <p className="text-sm text-slate-400">{label}</p>
            <p className={`mt-3 text-4xl font-black ${color}`}>{formatNumber(value)}</p>
            <p className="mt-2 text-xs text-slate-500">{detail}</p>
          </div>
        ))}
      </section>

      {/* Charts row 1 */}
      <section className="grid gap-4 xl:grid-cols-2">
        <DailyCallsChart data={data.dailyCalls} />
        <LeadStatusDonut data={donutData} />
      </section>

      {/* Charts row 2 */}
      <section className="grid gap-4 xl:grid-cols-2">
        <WaDailySendsChart data={data.dailyWa} />
        <TaskCompletionChart data={data.dailyTasks} />
      </section>

      {/* Status bars */}
      <section className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
          <h2 className="text-base font-semibold text-white">Task breakdown</h2>
          <div className="mt-4 space-y-4">
            {taskStatuses.map((s) => {
              const count = taskCounts[s];
              return (
                <div key={s}>
                  <div className="flex justify-between text-sm"><span className="text-slate-300">{label(s)}</span><span className="font-bold text-white">{formatNumber(count)} — {percent(count, totalTasks)}</span></div>
                  <div className="mt-2 h-2 rounded-full bg-black/40"><div className="h-full rounded-full bg-cyan-400 transition-all" style={{ width: barWidth(count, totalTasks) }} /></div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
          <h2 className="text-base font-semibold text-white">Call lead breakdown</h2>
          <div className="mt-4 space-y-4">
            {callLeadStatuses.map((s) => {
              const count = callCounts[s];
              return (
                <div key={s}>
                  <div className="flex justify-between text-sm"><span className="text-slate-300">{label(s)}</span><span className="font-bold text-white">{formatNumber(count)} — {percent(count, totalCallLeads)}</span></div>
                  <div className="mt-2 h-2 rounded-full bg-black/40"><div className="h-full rounded-full bg-emerald-400 transition-all" style={{ width: barWidth(count, totalCallLeads) }} /></div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Lead Demographics & Performance */}
      <section className="grid gap-4 xl:grid-cols-2">
        {/* Lead Performance Rates */}
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
          <h2 className="text-base font-semibold text-white">Lead Performance Metrics</h2>
          <p className="mt-1 text-xs text-slate-500">Key percentages based on caller outcome tracking</p>
          <div className="mt-5 grid gap-4 grid-cols-3 text-center">
            <div className="rounded-lg bg-black/25 p-4 border border-white/5">
              <p className="text-xs text-slate-400 font-medium">Conversion Rate</p>
              <p className="mt-2 text-3xl font-black text-emerald-300">{conversionRatePercent}</p>
              <p className="mt-1 text-[10px] text-slate-500">{formatNumber(callCounts.CONVERTED ?? 0)} converted</p>
            </div>
            <div className="rounded-lg bg-black/25 p-4 border border-white/5">
              <p className="text-xs text-slate-400 font-medium">Response Rate</p>
              <p className="mt-2 text-3xl font-black text-cyan-300">{responseRatePercent}</p>
              <p className="mt-1 text-[10px] text-slate-500">{formatNumber(respondedLeads)} answered</p>
            </div>
            <div className="rounded-lg bg-black/25 p-4 border border-white/5">
              <p className="text-xs text-slate-400 font-medium">Location Sent</p>
              <p className="mt-2 text-3xl font-black text-violet-300">{locationSentPercent}</p>
              <p className="mt-1 text-[10px] text-slate-500">{formatNumber(data.locationSentCount ?? 0)} leads</p>
            </div>
          </div>
        </div>

        {/* Lead Demographics (Top Cities & Property Types) */}
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5 flex flex-col justify-between">
          <div>
            <h2 className="text-base font-semibold text-white">Top Inquiring Locations & Properties</h2>
            <p className="mt-1 text-xs text-slate-500">Geographic and property distributions from Google Forms</p>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.1em] text-slate-400 mb-2">Top Cities</p>
              <div className="space-y-2">
                {data.topCities.map((c: { city: string | null; _count: { _all: number } }) => (
                  <div key={c.city || "unknown"} className="flex items-center justify-between text-xs py-1 border-b border-white/5">
                    <span className="text-slate-300 font-medium truncate max-w-[120px]">{c.city || "Unknown"}</span>
                    <span className="font-bold text-white bg-white/5 px-2 py-0.5 rounded">{formatNumber(c._count._all)}</span>
                  </div>
                ))}
                {!data.topCities.length && <p className="text-xs text-slate-500 italic">No city records found</p>}
              </div>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.1em] text-slate-400 mb-2">Property Types</p>
              <div className="space-y-2">
                {data.propertyTypes.map((p: { ownershipType: string | null; _count: { _all: number } }) => (
                  <div key={p.ownershipType || "unknown"} className="flex items-center justify-between text-xs py-1 border-b border-white/5">
                    <span className="text-slate-300 font-medium capitalize truncate max-w-[120px]">{(p.ownershipType || "").toLowerCase()}</span>
                    <span className="font-bold text-white bg-white/5 px-2 py-0.5 rounded">{formatNumber(p._count._all)}</span>
                  </div>
                ))}
                {!data.propertyTypes.length && <p className="text-xs text-slate-500 italic">No property type records found</p>}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* User workload */}
      <section className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
        <h2 className="text-base font-semibold text-white">Agent Productivity & Workload</h2>
        <p className="mt-1 text-xs text-slate-500">Live operational output and call tracker metrics for agents</p>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-xs uppercase tracking-[0.16em] text-slate-500">
              <tr>
                {["User", "Role", "Assigned Tasks", "Assigned Leads", "Assigned Follow-ups", "Completed Tasks", "Calls Attended", "Total Talk Time"].map((h) => (
                  <th key={h} className={`border-b border-white/10 py-3 ${h !== "User" && h !== "Role" ? "text-right px-4" : ""}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {data.users.map((u: { id: string; username: string; role: string; _count: { assignedTasks: number; callLeads: number; callFollowUps: number } }) => {
                const completedCount = data.agentCompletedTasks.find((t: { assignedToId: string; _count: { _all: number } }) => t.assignedToId === u.id)?._count._all ?? 0;
                const callStat = data.agentCallStats.find((c: { assignedToId: string | null; _count: { _all: number }; _sum: { durationSeconds: number | null } }) => c.assignedToId === u.id);
                const callsAttended = callStat?._count._all ?? 0;
                const talkTimeSeconds = callStat?._sum.durationSeconds ?? 0;

                return (
                  <tr key={u.id} className="transition hover:bg-white/[0.02]">
                    <td className="py-3 font-semibold text-white">{u.username}</td>
                    <td className="py-3 text-slate-400">{label(u.role)}</td>
                    <td className="py-3 text-right text-slate-200 px-4">{u._count.assignedTasks}</td>
                    <td className="py-3 text-right text-slate-200 px-4">{u._count.callLeads}</td>
                    <td className="py-3 text-right text-slate-200 px-4">{u._count.callFollowUps}</td>
                    <td className="py-3 text-right text-emerald-300 font-bold px-4">{formatNumber(completedCount)}</td>
                    <td className="py-3 text-right text-cyan-300 font-bold px-4">{formatNumber(callsAttended)}</td>
                    <td className="py-3 text-right text-violet-300 font-bold px-4">{formatDuration(talkTimeSeconds)}</td>
                  </tr>
                );
              })}
              {!data.users.length && <tr><td colSpan={8} className="py-6 text-slate-500">No users found.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
