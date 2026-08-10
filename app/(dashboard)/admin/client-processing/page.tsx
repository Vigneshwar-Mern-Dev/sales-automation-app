export const dynamic = "force-dynamic";

import type { Prisma } from "@prisma/client";
import { db } from "@/app/lib/db";
import { CallLeadStatus, WhatsAppLeadStatus } from "@/app/lib/prisma-enums";
import { ClientProcessingClient } from "./client-processing-client";
import {
  buildWhatsAppQueueEstimates,
  type WhatsAppQueueEstimate,
} from "@/app/lib/whatsapp-queue-eta";
import {
  COMPLETED_WHATSAPP_QUEUE_STATUSES,
  hasCompletedWhatsAppDelivery,
} from "@/app/lib/whatsapp-delivery-status";

type PageProps = {
  searchParams: Promise<{
    page?: string;
    q?: string;
    agent?: string;
    callStatus?: string;
    waStatus?: string;
  }>;
};

const PAGE_SIZE = 25;
const visiblePhoneFilter: Prisma.StringFilter<"CallLead"> = {
  not: { startsWith: "UNKNOWN-" },
};

export default async function AdminClientProcessingPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10));
  const q = params.q ?? "";
  const agentId = params.agent ?? "ALL";
  const callStatus = params.callStatus ?? "ALL";
  const waStatus = params.waStatus ?? "ALL";
  const skip = (page - 1) * PAGE_SIZE;
  const queryNow = new Date();
  const todayStart = new Date(queryNow);
  todayStart.setHours(0, 0, 0, 0);
  const sentHistoryStart = new Date(Math.min(todayStart.getTime(), queryNow.getTime() - 60 * 60 * 1000));

  // Build CallLead filtering criteria
  const callLeadWhere: Prisma.CallLeadWhereInput = {
    phone: visiblePhoneFilter,
    deletedAt: null,
    isArchived: false,
  };

  if (q) {
    callLeadWhere.OR = [
      { displayName: { contains: q, mode: "insensitive" as const } },
      { phone: { contains: q } },
    ];
  }

  if (agentId !== "ALL") {
    callLeadWhere.assignedToId = agentId === "UNASSIGNED" ? null : agentId;
  }

  if (callStatus !== "ALL") {
    callLeadWhere.status = callStatus as CallLeadStatus;
  }

  // If filtering by WhatsApp state, derive phone lists from the source table for that state.
  if (waStatus !== "ALL") {
    if (waStatus === "NOT_QUEUED") {
      const allWaLeads = await db.whatsAppLead.findMany({
        where: { deletedAt: null, isArchived: false },
        select: { phone: true },
      });
      callLeadWhere.phone = { ...visiblePhoneFilter, notIn: allWaLeads.map((wl) => wl.phone) };
    } else if (waStatus === "QUEUED") {
      const activeQueueItems = await db.whatsAppQueueItem.findMany({
        where: { status: { in: ["QUEUED", "SENDING"] }, deletedAt: null, isArchived: false },
        select: { phone: true },
      });
      callLeadWhere.phone = { ...visiblePhoneFilter, in: activeQueueItems.map((item) => item.phone) };
    } else if (waStatus === "SENT") {
      const sentQueueItems = await db.whatsAppQueueItem.findMany({
        where: {
          status: { in: [...COMPLETED_WHATSAPP_QUEUE_STATUSES] },
          deletedAt: null,
          isArchived: false,
        },
        select: { phone: true },
      });
      callLeadWhere.phone = { ...visiblePhoneFilter, in: sentQueueItems.map((item) => item.phone) };
    } else if (waStatus === "FAILED") {
      const failedPhones = await db.whatsAppLead.findMany({
        where: {
          deletedAt: null,
          isArchived: false,
          OR: [
            { status: WhatsAppLeadStatus.FAILED },
            { queueItems: { some: { status: "FAILED", deletedAt: null, isArchived: false } } },
          ],
        },
        select: { phone: true },
      });
      callLeadWhere.phone = { ...visiblePhoneFilter, in: failedPhones.map((lead) => lead.phone) };
    } else if (waStatus === "REPLIED") {
      const repliedPhones = await db.whatsAppLead.findMany({
        where: {
          deletedAt: null,
          isArchived: false,
          OR: [{ status: WhatsAppLeadStatus.REPLIED }, { lastReplyAt: { not: null } }],
        },
        select: { phone: true },
      });
      callLeadWhere.phone = { ...visiblePhoneFilter, in: repliedPhones.map((lead) => lead.phone) };
    } else {
      const matchingWaLeads = await db.whatsAppLead.findMany({
        where: { status: waStatus as WhatsAppLeadStatus, deletedAt: null, isArchived: false },
        select: { phone: true },
      });
      callLeadWhere.phone = { ...visiblePhoneFilter, in: matchingWaLeads.map((wl) => wl.phone) };
    }
  }

  // Fetch paginated leads and configuration
  const [
    callLeads,
    totalCount,
    allQueuedLeads,
    waAccounts,
    sentItemsToday,
    agents,
    totalCallLeads,
    totalQueued,
    totalSent,
    totalReplied,
    totalFailed,
  ] = await Promise.all([
    db.callLead.findMany({
      where: callLeadWhere,
      include: {
        assignedTo: { select: { id: true, username: true, email: true, department: true } },
      },
      orderBy: { updatedAt: "desc" },
      skip,
      take: PAGE_SIZE,
    }),
    db.callLead.count({ where: callLeadWhere }),
    // Fetch ALL queued WA leads (for accurate queue position)
    db.whatsAppQueueItem.findMany({
      where: { status: { in: ["QUEUED", "SENDING"] }, deletedAt: null, isArchived: false },
      orderBy: [{ sendAfterAt: "asc" }, { queuedAt: "asc" }, { id: "asc" }],
      select: { id: true, accountId: true, phone: true, status: true, queuedAt: true, sendAfterAt: true },
    }),
    // Get per-account dispatch settings and health.
    db.whatsAppAccount.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        label: true,
        status: true,
        autoReplyEnabled: true,
        lastHeartbeatAt: true,
        consecutiveFailures: true,
        autoPauseThreshold: true,
        hourlySendLimit: true,
        dailySendLimit: true,
        warmupEnabled: true,
        warmupStartDate: true,
        warmupRampPerDay: true,
        minDelaySeconds: true,
        maxDelaySeconds: true,
      },
    }),
    db.whatsAppQueueItem.findMany({
      where: { sentAt: { gte: sentHistoryStart }, deletedAt: null },
      select: { accountId: true, sentAt: true },
    }),
    // Get active agents
    db.user.findMany({
      where: { role: "USER", isActive: true },
      select: { id: true, username: true, email: true, department: true },
      orderBy: { username: "asc" },
    }),
    // Stats
    db.callLead.count({ where: { phone: { not: { startsWith: "UNKNOWN-" } }, deletedAt: null, isArchived: false } }),
    db.whatsAppQueueItem.count({ where: { status: { in: ["QUEUED", "SENDING"] }, deletedAt: null, isArchived: false } }),
    db.whatsAppQueueItem.count({
      where: {
        status: { in: [...COMPLETED_WHATSAPP_QUEUE_STATUSES] },
        deletedAt: null,
        isArchived: false,
      },
    }),
    db.whatsAppLead.count({ where: { OR: [{ status: WhatsAppLeadStatus.REPLIED }, { lastReplyAt: { not: null } }], deletedAt: null, isArchived: false } }),
    db.whatsAppLead.count({ where: { OR: [{ status: WhatsAppLeadStatus.FAILED }, { queueItems: { some: { status: "FAILED", deletedAt: null, isArchived: false } } }], deletedAt: null, isArchived: false } }),
  ]);

  // Fetch WhatsAppLead records for the retrieved CallLeads
  const leadPhones = callLeads.map((cl) => cl.phone);
  const waLeads = await db.whatsAppLead.findMany({
    where: { phone: { in: leadPhones }, deletedAt: null, isArchived: false },
    select: {
      id: true,
      phone: true,
      status: true,
      lastSentAt: true,
      lastReplyAt: true,
      lastReplySnippet: true,
      lastError: true,
      updatedAt: true,
      queueItems: {
        where: { deletedAt: null, isArchived: false },
        orderBy: [{ queuedAt: "desc" }],
        select: { status: true },
      },
    },
  });

  const waLeadMap = new Map(waLeads.map((wl) => [wl.phone, wl]));

  // Build queue position map — only QUEUED items get sequential positions
  const serverNow = queryNow;
  const estimates = buildWhatsAppQueueEstimates(allQueuedLeads, waAccounts, sentItemsToday, serverNow);
  const queueEstimateMap = new Map<string, WhatsAppQueueEstimate>();
  allQueuedLeads.forEach((ql) => {
    const estimate = estimates.get(ql.id);
    if (estimate && !queueEstimateMap.has(ql.phone)) queueEstimateMap.set(ql.phone, estimate);
  });

  const avgDelay = waAccounts.length
    ? Math.round(waAccounts.reduce((sum, account) => sum + (account.minDelaySeconds + account.maxDelaySeconds) / 2, 0) / waAccounts.length)
    : 120;

  const serverTime = serverNow.getTime();

  // Correlate CallLeads with their WhatsApp details
  const rows = callLeads.map((cl) => {
    const wa = waLeadMap.get(cl.phone) || null;
    const eta = queueEstimateMap.get(cl.phone) ?? null;

    return {
      id: cl.id,
      phone: cl.phone,
      displayName: cl.displayName,
      email: cl.email,
      city: cl.city,
      address: cl.address,
      ownershipType: cl.ownershipType,
      language: cl.language,
      message: cl.message,
      status: cl.status,
      assignedToId: cl.assignedToId,
      assignedToName: cl.assignedTo?.username ?? null,
      lastContactedAt: cl.lastContactedAt,
      nextFollowUpAt: cl.nextFollowUpAt,
      isImportant: cl.isImportant,
      updatedAt: cl.updatedAt,
      createdAt: cl.createdAt,
      // WhatsApp related fields
      waLeadId: wa?.id ?? null,
      waStatus: wa
        ? hasCompletedWhatsAppDelivery(wa.queueItems.map((item) => item.status))
          ? "SENT"
          : wa.status
        : null,
      waLastSentAt: wa?.lastSentAt ?? null,
      waLastReplyAt: wa?.lastReplyAt ?? null,
      waLastReplySnippet: wa?.lastReplySnippet ?? null,
      waLastError:
        wa && hasCompletedWhatsAppDelivery(wa.queueItems.map((item) => item.status))
          ? null
          : wa?.lastError ?? null,
      queuePosition: eta?.position ?? null,
      targetTime: eta?.earliestAt ?? null,
      eta,
    };
  });

  return (
    <ClientProcessingClient
      rows={rows}
      agents={agents}
      total={totalCount}
      page={page}
      totalPages={Math.ceil(totalCount / PAGE_SIZE)}
      avgDelaySeconds={avgDelay}
      totalCallLeads={totalCallLeads}
      totalQueued={totalQueued}
      totalSent={totalSent}
      totalReplied={totalReplied}
      totalFailed={totalFailed}
      accountHealth={waAccounts.map((account) => ({
        id: account.id,
        label: account.label,
        status:
          account.status === "CONNECTED" &&
          (!account.lastHeartbeatAt ||
            serverNow.getTime() - account.lastHeartbeatAt.getTime() > 5 * 60 * 1000)
            ? "DISCONNECTED"
            : account.status,
        autoReplyEnabled: account.autoReplyEnabled,
      }))}
      serverTime={serverTime}
      initialSearch={q}
      initialAgent={agentId}
      initialCallStatus={callStatus}
      initialWaStatus={waStatus}
    />
  );
}

