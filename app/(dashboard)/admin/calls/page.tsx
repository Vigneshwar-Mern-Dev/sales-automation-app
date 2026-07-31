import Link from "next/link";
import { db } from "@/app/lib/db";
import { expireStaleRingingCalls } from "@/app/lib/call-session-maintenance";
import {
  CallCenterTabs,
  CallStatusBadge,
  EmptyState,
  PageHeader,
  Panel,
  PanelTitle,
  StatCard,
  StatusBadge,
  TopLink,
  formatDateTime,
  formatDuration,
} from "./call-ui";

type AssignedGroupCount = {
  assignedToId: string | null;
  _count: { _all: number };
};

type UserGroupCount = {
  userId: string | null;
  _count: { _all: number };
};

type AssignedSessionSummary = {
  assignedToId: string | null;
  lead: { assignedToId: string | null } | null;
  status?: string;
};

export default async function AdminCallCenterPage() {
  await expireStaleRingingCalls();

  const currentTime = new Date();
  const today = new Date(currentTime);
  today.setHours(0, 0, 0, 0);

  const stalePhoneThreshold = new Date(currentTime.getTime() - 15 * 60 * 1000);
  const actionableLeadStatuses = ["NEW", "CONTACTED", "FOLLOW_UP", "INTERESTED", "NO_RESPONSE"] as const;
  const outcomeStatuses = ["NOT_INTERESTED", "CONVERTED", "CLOSED"] as const;

  const [
    todaySessions,
    missedSessions,
    liveSessions,
    callLeads,
    phones,
    unhealthyPhones,
    recentSessions,
    liveDetails,
    newLeadsToday,
    overdueMissedSessions,
    agents,
    ownedLeadsGroup,
    openLeadsGroup,
    claimedTodayGroup,
    sheetSavedTodayGroup,
    followUpsGroup,
    outcomesTodayGroup,
    detailUpdatesTodayGroup,
    workflowUpdatesTodayGroup,
    outgoingCallsTodayGroup,
    liveSessionsGroup,
    missedSessionsGroup,
    allRecentWork,
  ] =
    await Promise.all([
      db.callSession.count({ where: { firstRingAt: { gte: today } } }),
      db.callSession.count({
        where: {
          status: "MISSED",
          lead: { status: { in: [...actionableLeadStatuses] } },
        },
      }),
      db.callSession.count({ where: { status: { in: ["RINGING", "ANSWERED"] }, endedAt: null } }),
      db.callLead.count({
        where: { phone: { not: { startsWith: "UNKNOWN-" } }, status: { in: [...actionableLeadStatuses] } },
      }),
      db.companyPhone.count({ where: { isActive: true } }),
      db.companyPhone.count({
        where: {
          isActive: true,
          OR: [
            { lastSeenAt: null },
            { lastSeenAt: { lt: stalePhoneThreshold } },
            { batteryPercent: { lt: 20 } },
            { pendingSyncCount: { gt: 0 } },
          ],
        },
      }),
      db.callSession.findMany({
        where: { callerNumber: { not: { startsWith: "UNKNOWN-" } } },
        include: {
          companyPhone: { select: { phoneNumber: true, label: true } },
          lead: { select: { id: true, phone: true, displayName: true } },
        },
        orderBy: { firstRingAt: "desc" },
        take: 8,
      }),
      db.callSession.findMany({
        where: { status: { in: ["RINGING", "ANSWERED"] }, endedAt: null },
        include: {
          companyPhone: { select: { phoneNumber: true, label: true } },
          lead: {
            select: {
              id: true,
              phone: true,
              displayName: true,
              status: true,
              createdAt: true,
              _count: { select: { sessions: true } },
            },
          },
          assignedTo: { select: { username: true } },
        },
        orderBy: { firstRingAt: "desc" },
        take: 6,
      }),
      db.callLead.count({ where: { createdAt: { gte: today }, phone: { not: { startsWith: "UNKNOWN-" } } } }),
      db.callSession.count({
        where: {
          status: "MISSED",
          firstRingAt: { lt: new Date(currentTime.getTime() - 30 * 60 * 1000) },
          lead: { status: { in: [...actionableLeadStatuses] } },
        },
      }),
      db.user.findMany({
        where: { role: "USER", isActive: true },
        orderBy: { username: "asc" },
        select: { id: true, username: true, email: true },
      }),
      // Grouped queries
      db.callLead.groupBy({
        by: ["assignedToId"],
        _count: { _all: true },
      }),
      db.callLead.groupBy({
        by: ["assignedToId"],
        where: { status: { in: [...actionableLeadStatuses] } },
        _count: { _all: true },
      }),
      db.callActivity.groupBy({
        by: ["userId"],
        where: {
          actionType: "ASSIGNMENT_CHANGE",
          description: { contains: "claimed" },
          createdAt: { gte: today },
        },
        _count: { _all: true },
      }),
      db.callLead.groupBy({
        by: ["assignedToId"],
        where: { sheetSyncedAt: { gte: today } },
        _count: { _all: true },
      }),
      db.callFollowUp.groupBy({
        by: ["assignedToId"],
        where: { completedAt: null },
        _count: { _all: true },
      }),
      db.callLead.groupBy({
        by: ["assignedToId"],
        where: { status: { in: [...outcomeStatuses] }, updatedAt: { gte: today } },
        _count: { _all: true },
      }),
      db.callActivity.groupBy({
        by: ["userId"],
        where: {
          actionType: "NOTE_ADDED",
          description: "Call lead customer details updated",
          createdAt: { gte: today },
        },
        _count: { _all: true },
      }),
      db.callActivity.groupBy({
        by: ["userId"],
        where: {
          OR: [
            { actionType: "FOLLOW_UP_UPDATE" },
            { actionType: "NOTE_ADDED", description: { startsWith: "Call lead status updated" } },
          ],
          createdAt: { gte: today },
        },
        _count: { _all: true },
      }),
      db.callSession.findMany({
        where: {
          firstRingAt: { gte: today },
          callDirection: "OUTGOING",
        },
        select: {
          assignedToId: true,
          lead: { select: { assignedToId: true } },
          status: true,
        },
      }),
      db.callSession.findMany({
        where: {
          status: { in: ["RINGING", "ANSWERED"] },
          endedAt: null,
        },
        select: {
          assignedToId: true,
          lead: { select: { assignedToId: true } },
        },
      }),
      db.callSession.findMany({
        where: {
          status: "MISSED",
        },
        select: {
          assignedToId: true,
          lead: { select: { assignedToId: true } },
        },
      }),
      db.callActivity.findMany({
        where: {
          actionType: { in: ["ASSIGNMENT_CHANGE", "FOLLOW_UP_UPDATE", "NOTE_ADDED"] },
          NOT: { description: { startsWith: "Saved in CRM only" } },
          createdAt: { gte: today },
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          actionType: true,
          description: true,
          createdAt: true,
          userId: true,
          lead: { select: { displayName: true, phone: true } },
        },
      }),
    ]);

  // Helpers to fetch grouped counts
  const getGroupCount = (group: readonly AssignedGroupCount[], agentId: string) => {
    return group.find((g) => g.assignedToId === agentId)?._count._all ?? 0;
  };
  const getUserGroupCount = (group: readonly UserGroupCount[], agentId: string) => {
    return group.find((g) => g.userId === agentId)?._count._all ?? 0;
  };

  // Memory filtering functions for callSessions matching assignedFilter
  const matchesAssignedFilter = (session: AssignedSessionSummary, agentId: string) => {
    return session.assignedToId === agentId || session.lead?.assignedToId === agentId;
  };

  const agentRows = await Promise.all(
    agents.map(async (agent) => {
      const ownedLeads = getGroupCount(ownedLeadsGroup, agent.id);
      const openLeads = getGroupCount(openLeadsGroup, agent.id);
      const claimedToday = getUserGroupCount(claimedTodayGroup, agent.id);
      const sheetSavedToday = getGroupCount(sheetSavedTodayGroup, agent.id);
      const followUps = getGroupCount(followUpsGroup, agent.id);
      const outcomesToday = getGroupCount(outcomesTodayGroup, agent.id);
      const detailUpdatesToday = getUserGroupCount(detailUpdatesTodayGroup, agent.id);
      const workflowUpdatesToday = getUserGroupCount(workflowUpdatesTodayGroup, agent.id);

      // In-memory calculations for session counts
      const outgoingCallsToday = outgoingCallsTodayGroup.filter((session) => matchesAssignedFilter(session, agent.id)).length;
      const completed = outgoingCallsTodayGroup.filter((session) => matchesAssignedFilter(session, agent.id) && session.status === "COMPLETED").length;
      const live = liveSessionsGroup.filter((session) => matchesAssignedFilter(session, agent.id)).length;
      const missed = missedSessionsGroup.filter((session) => matchesAssignedFilter(session, agent.id)).length;

      // Filter recent work for this agent
      const recentWork = allRecentWork.filter((work) => work.userId === agent.id).slice(0, 5);

      // Fetch last session (this is a fast select)
      const lastSession = await db.callSession.findFirst({
        where: {
          OR: [
            { assignedToId: agent.id },
            { lead: { assignedToId: agent.id } },
          ],
        },
        orderBy: { firstRingAt: "desc" },
        select: {
          firstRingAt: true,
          status: true,
          durationSeconds: true,
          lead: { select: { displayName: true, phone: true } },
        },
      });

      return {
        ...agent,
        ownedLeads,
        openLeads,
        claimedToday,
        workedToday: claimedToday + detailUpdatesToday + workflowUpdatesToday,
        sheetSavedToday,
        outgoingCallsToday,
        live,
        missed,
        completed,
        followUps,
        outcomesToday,
        detailUpdatesToday,
        workflowUpdatesToday,
        recentWork,
        lastSession,
      };
    }),
  );

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        actions={
          <>
            <TopLink href="/admin/calls/missed" primary>Open callback queue</TopLink>
          </>
        }
        description="Monitor incoming activity, clear missed-call callbacks, and keep every company phone ready to receive calls."
        title="Call center overview"
      />
      <CallCenterTabs />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard detail="Incoming sessions since midnight" label="Calls today" value={todaySessions} />
        <StatCard detail="Ringing or currently connected" label="Live now" tone="emerald" value={liveSessions} />
        <StatCard detail="Missed sessions on open leads" label="Needs callback" tone="rose" value={missedSessions} />
        <StatCard detail={`${unhealthyPhones} device${unhealthyPhones === 1 ? "" : "s"} need attention`} label="Phones online" tone={unhealthyPhones ? "amber" : "cyan"} value={`${phones - unhealthyPhones}/${phones}`} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Panel className={liveSessions ? "border-emerald-300/20 bg-emerald-300/[0.045]" : ""}>
          <PanelTitle
            action={<StatusBadge tone={liveSessions ? "emerald" : "slate"}>{liveSessions ? "Live" : "Idle"}</StatusBadge>}
            description="Calls that Android is reporting in real time."
            title="Live signal board"
          />
          <div className="divide-y divide-white/10">
            {liveDetails.map((call) => {
              const isNewLead = call.lead._count.sessions <= 1 || currentTime.getTime() - call.lead.createdAt.getTime() < 10 * 60 * 1000;

              return (
                <div className="grid gap-3 px-5 py-4 text-sm sm:grid-cols-[1fr_auto] sm:items-center" key={call.id}>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-black text-white">{call.lead.displayName}</p>
                      <StatusBadge tone={call.callDirection === "OUTGOING" ? "amber" : "emerald"}>{call.callDirection === "OUTGOING" ? "Outgoing" : "Incoming"}</StatusBadge>
                      {isNewLead ? <StatusBadge tone="rose">New lead</StatusBadge> : null}
                    </div>
                    <p className="mt-1 truncate text-xs text-slate-500">
                      {call.lead.phone} <span className="px-1 text-slate-700">/</span> {call.companyPhone.label} <span className="px-1 text-slate-700">/</span> {call.assignedTo?.username || "Unassigned"}
                    </p>
                  </div>
                  <div className="text-xs text-slate-400 sm:text-right">
                    <CallStatusBadge status={call.status} />
                    <p className="mt-2">{formatDateTime(call.firstRingAt)}</p>
                  </div>
                </div>
              );
            })}
            {!liveDetails.length ? <EmptyState>No live calls right now.</EmptyState> : null}
          </div>
        </Panel>

        <Panel>
          <PanelTitle description="The numbers that should trigger action now." title="Queue pressure" />
          <div className="grid gap-3 p-4 sm:grid-cols-3">
            <div className="rounded-xl border border-cyan-300/15 bg-cyan-300/[0.06] p-4">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-cyan-100">New today</p>
              <p className="mt-3 text-3xl font-black text-white">{newLeadsToday}</p>
              <p className="mt-2 text-xs text-slate-500">Fresh call leads created today</p>
            </div>
            <div className="rounded-xl border border-rose-300/15 bg-rose-300/[0.06] p-4">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-rose-100">Overdue</p>
              <p className="mt-3 text-3xl font-black text-white">{overdueMissedSessions}</p>
              <p className="mt-2 text-xs text-slate-500">Missed callbacks waiting 30+ min</p>
            </div>
            <div className="rounded-xl border border-amber-300/15 bg-amber-300/[0.06] p-4">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-amber-100">Device risk</p>
              <p className="mt-3 text-3xl font-black text-white">{unhealthyPhones}</p>
              <p className="mt-2 text-xs text-slate-500">Phones offline, low, or pending sync</p>
            </div>
          </div>
        </Panel>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
        <Panel>
          <PanelTitle
            action={<Link className="text-xs font-bold text-cyan-200 hover:text-cyan-100" href="/admin/calls/leads">View all leads</Link>}
            description="Latest activity across registered company phones."
            title="Recent call activity"
          />
          <div className="divide-y divide-white/10">
            {recentSessions.map((session) => (
              <div className="grid gap-3 px-5 py-4 text-sm sm:grid-cols-[1fr_auto_auto] sm:items-center" key={session.id}>
                <div className="min-w-0">
                  <p className="truncate font-bold text-white">{session.lead.displayName}</p>
                  <p className="mt-1 truncate text-xs text-slate-500">
                    {session.lead.phone} <span className="px-1 text-slate-700">/</span> {session.companyPhone.label}
                  </p>
                </div>
                <CallStatusBadge status={session.status} />
                <div className="text-xs text-slate-500 sm:text-right">
                  <p>{formatDateTime(session.firstRingAt)}</p>
                  <p className="mt-1">{formatDuration(session.durationSeconds)}</p>
                </div>
              </div>
            ))}
            {!recentSessions.length ? <EmptyState>No call sessions received yet.</EmptyState> : null}
          </div>
        </Panel>

        <Panel>
          <PanelTitle description="Work the queue in this order." title="Operator focus" />
          <div className="space-y-3 p-4">
            {[
              ["/admin/calls/missed", "01", "Handle call queue", `${liveSessions} live / ${missedSessions} callbacks`, liveSessions ? "emerald" : missedSessions ? "rose" : "slate"],
              ["/admin/calls/leads", "02", "Update call leads", `${callLeads} open leads`, callLeads ? "cyan" : "slate"],
              ["/admin/calls/phones", "03", "Check company phones", `${unhealthyPhones} need attention`, unhealthyPhones ? "amber" : "slate"],
            ].map(([href, step, label, detail, tone]) => (
              <Link className="group flex items-center gap-3 rounded-xl border border-white/5 bg-black/20 p-3 transition hover:border-white/15 hover:bg-white/5" href={href} key={href}>
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-white/5 text-xs font-black text-slate-500">{step}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-white">{label}</span>
                  <span className="mt-1 block text-xs text-slate-500">{detail}</span>
                </span>
                <StatusBadge tone={tone as "slate" | "cyan" | "emerald" | "amber" | "rose"}>Open</StatusBadge>
              </Link>
            ))}
          </div>
        </Panel>
      </section>

      <Panel>
        <PanelTitle
          description="Today summary by user. Claimed means the user took an open lead; work means lead saves, workflow updates, or sheet saves by that user."
          title="Agent call details"
        />
        <div className="overflow-x-auto">
          <div className="min-w-[1360px]">
            <div className="grid grid-cols-[0.65fr_1fr_0.65fr_0.65fr_0.65fr_0.7fr_0.7fr_0.75fr_0.65fr_0.65fr_0.75fr_0.75fr_1.2fr] gap-3 border-b border-white/10 px-5 py-3 text-xs font-semibold text-slate-400">
              <span>Date</span>
              <span>Agent</span>
              <span>Owned</span>
              <span>Open leads</span>
              <span>Claimed</span>
              <span>Work</span>
              <span>Sheet</span>
              <span>Outgoing</span>
              <span>Live</span>
              <span>Missed</span>
              <span>Outcomes</span>
              <span>Follow-ups</span>
              <span>Last activity</span>
            </div>
            <div className="divide-y divide-white/10">
              {agentRows.map((agent) => (
                <details className="group" key={agent.id}>
                  <summary className="grid cursor-pointer list-none grid-cols-[0.65fr_1fr_0.65fr_0.65fr_0.65fr_0.7fr_0.7fr_0.75fr_0.65fr_0.65fr_0.75fr_0.75fr_1.2fr] items-center gap-3 px-5 py-4 text-sm transition hover:bg-white/[0.03] [&::-webkit-details-marker]:hidden">
                    <span className="text-slate-400">{currentTime.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</span>
                    <div className="min-w-0">
                      <Link className="truncate font-bold text-white transition hover:text-cyan-100 hover:underline" href={`/admin/calls/leads?agent=${agent.id}`}>
                        {agent.username}
                      </Link>
                      <p className="mt-1 truncate text-xs text-slate-500">{agent.email}</p>
                    </div>
                    <span className={agent.ownedLeads ? "font-bold text-white" : "text-slate-500"}>{agent.ownedLeads}</span>
                    <Link className="font-bold text-cyan-100 transition hover:text-cyan-50 hover:underline" href={`/admin/calls/leads?agent=${agent.id}`}>
                      {agent.openLeads}
                    </Link>
                    <span className={agent.claimedToday ? "font-bold text-cyan-100" : "text-slate-500"}>{agent.claimedToday}</span>
                    <span className={agent.workedToday ? "font-bold text-white" : "text-slate-500"}>{agent.workedToday}</span>
                    <span className={agent.sheetSavedToday ? "font-bold text-emerald-200" : "text-slate-500"}>{agent.sheetSavedToday}</span>
                    <div>
                      <p className="font-bold text-white">{agent.outgoingCallsToday}</p>
                      <p className="mt-1 text-xs text-slate-500">{agent.completed} completed</p>
                    </div>
                    <span className={agent.live ? "font-bold text-emerald-200" : "text-slate-500"}>{agent.live}</span>
                    <span className={agent.missed ? "font-bold text-rose-200" : "text-slate-500"}>{agent.missed}</span>
                    <span className={agent.outcomesToday ? "font-bold text-amber-100" : "text-slate-500"}>{agent.outcomesToday}</span>
                    <span className={agent.followUps ? "font-bold text-amber-100" : "text-slate-500"}>{agent.followUps}</span>
                    <div className="min-w-0 text-xs">
                      {agent.lastSession ? (
                        <>
                          <p className="truncate font-semibold text-slate-200">{agent.lastSession.lead.displayName}</p>
                          <p className="mt-1 truncate text-slate-500">
                            {agent.lastSession.status.replaceAll("_", " ")} <span className="px-1 text-slate-700">/</span> {formatDateTime(agent.lastSession.firstRingAt)} <span className="px-1 text-slate-700">/</span> {formatDuration(agent.lastSession.durationSeconds)}
                          </p>
                        </>
                      ) : (
                        <p className="text-slate-500">No call activity</p>
                      )}
                    </div>
                  </summary>
                  <div className="border-t border-white/10 bg-black/20 px-5 py-4">
                    <div className="grid gap-3 lg:grid-cols-[0.9fr_0.9fr_1.2fr]">
                      <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
                        <h3 className="text-xs font-black uppercase tracking-[0.14em] text-cyan-100">Today work</h3>
                        <dl className="mt-3 grid grid-cols-2 gap-3 text-xs">
                          <dt className="text-slate-500">Claimed leads</dt>
                          <dd className="font-bold text-white">{agent.claimedToday}</dd>
                          <dt className="text-slate-500">Detail edits</dt>
                          <dd className="font-bold text-white">{agent.detailUpdatesToday}</dd>
                          <dt className="text-slate-500">Workflow/notes</dt>
                          <dd className="font-bold text-white">{agent.workflowUpdatesToday}</dd>
                          <dt className="text-slate-500">Sheet saves</dt>
                          <dd className="font-bold text-white">{agent.sheetSavedToday}</dd>
                          <dt className="text-slate-500">Outcomes</dt>
                          <dd className="font-bold text-white">{agent.outcomesToday}</dd>
                        </dl>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
                        <h3 className="text-xs font-black uppercase tracking-[0.14em] text-cyan-100">Lead and call load</h3>
                        <dl className="mt-3 grid grid-cols-2 gap-3 text-xs">
                          <dt className="text-slate-500">Owned leads</dt>
                          <dd className="font-bold text-white">{agent.ownedLeads}</dd>
                          <dt className="text-slate-500">Still open</dt>
                          <dd className="font-bold text-white">{agent.openLeads}</dd>
                          <dt className="text-slate-500">Outgoing calls</dt>
                          <dd className="font-bold text-white">{agent.outgoingCallsToday}</dd>
                          <dt className="text-slate-500">Completed calls</dt>
                          <dd className="font-bold text-white">{agent.completed}</dd>
                          <dt className="text-slate-500">Live / missed</dt>
                          <dd className="font-bold text-white">{agent.live} / {agent.missed}</dd>
                        </dl>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
                        <h3 className="text-xs font-black uppercase tracking-[0.14em] text-cyan-100">Recent user activity</h3>
                        <div className="mt-3 space-y-3">
                          {agent.recentWork.map((activity) => (
                            <div className="text-xs" key={activity.id}>
                              <p className="font-bold text-white">{activity.lead.displayName}</p>
                              <p className="mt-1 text-slate-500">{activity.description}</p>
                              <p className="mt-1 text-slate-600">{formatDateTime(activity.createdAt)}</p>
                            </div>
                          ))}
                          {!agent.recentWork.length ? <p className="text-xs text-slate-500">No user work recorded today.</p> : null}
                        </div>
                      </div>
                    </div>
                  </div>
                </details>
              ))}
              {!agentRows.length ? <EmptyState>No users found for call center summary.</EmptyState> : null}
            </div>
          </div>
        </div>
      </Panel>
    </div>
  );
}
