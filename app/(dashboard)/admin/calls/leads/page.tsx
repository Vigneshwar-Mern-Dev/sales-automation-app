import { db } from "@/app/lib/db";
import { CallLeadsPage, type CallLeadRow } from "./call-leads-page";
import type { Prisma } from "@prisma/client";

type AdminCallLeadsPageProps = {
  searchParams: Promise<{
    agent?: string;
    filledForm?: string;
    page?: string;
    pageSize?: string;
    q?: string;
    queue?: string;
  }>;
};

const queueValues = ["ALL", "OPEN", "FOLLOW_UP", "UNASSIGNED", "IMPORTANT", "SYNCED"] as const;
type LeadQueue = (typeof queueValues)[number];
const pageSizeOptions = [10, 25, 50] as const;

export default async function AdminCallLeadsPage({ searchParams }: AdminCallLeadsPageProps) {
  const params = await searchParams;
  const filledFormOnly = params.filledForm === "true";
  const requestedPage = Math.max(1, Number.parseInt(params.page || "1", 10) || 1);
  const requestedPageSize = Number.parseInt(params.pageSize || "25", 10);
  const pageSize = pageSizeOptions.includes(requestedPageSize as (typeof pageSizeOptions)[number])
    ? requestedPageSize
    : 25;
  const search = (params.q || "").trim().slice(0, 100);
  const queue = queueValues.includes(params.queue as LeadQueue) ? (params.queue as LeadQueue) : "ALL";
  const activeCallLeadWhere = {
    phone: { not: { startsWith: "UNKNOWN-" } },
    deletedAt: null,
    isArchived: false,
  } satisfies Prisma.CallLeadWhereInput;
  const submittedFormWhere = {
    status: "FORM_SUBMITTED" as const,
    deletedAt: null,
  } satisfies Prisma.FormSubmissionWhereInput;
  const closedStatuses = ["CONVERTED", "CLOSED", "NOT_INTERESTED"] as const;
  const queueWhere: Prisma.CallLeadWhereInput =
    queue === "OPEN"
      ? { status: { notIn: [...closedStatuses] } }
      : queue === "FOLLOW_UP"
        ? { OR: [{ status: "FOLLOW_UP" }, { nextFollowUpAt: { not: null } }] }
        : queue === "UNASSIGNED"
          ? { assignedToId: null }
          : queue === "IMPORTANT"
            ? { isImportant: true }
            : queue === "SYNCED"
              ? { sheetSyncedAt: { not: null } }
              : {};
  const filteredWhere: Prisma.CallLeadWhereInput = {
    AND: [
      activeCallLeadWhere,
      queueWhere,
      ...(filledFormOnly ? [{ formSubmissions: { some: submittedFormWhere } }] : []),
      ...(params.agent && params.agent !== "ALL" ? [{ assignedToId: params.agent }] : []),
      ...(search
        ? [{
            OR: [
              { displayName: { contains: search, mode: "insensitive" as const } },
              { phone: { contains: search, mode: "insensitive" as const } },
              { email: { contains: search, mode: "insensitive" as const } },
              { city: { contains: search, mode: "insensitive" as const } },
              { assignedTo: { is: { username: { contains: search, mode: "insensitive" as const } } } },
            ],
          }]
        : []),
    ],
  };

  const [totalLeads, agents, queueCounts] = await Promise.all([
    db.callLead.count({ where: filteredWhere }),
    db.user.findMany({
      where: { role: "USER", isActive: true },
      select: { id: true, username: true, email: true, department: true },
      orderBy: { username: "asc" },
    }),
    Promise.all([
      db.callLead.count({ where: { ...activeCallLeadWhere, status: { notIn: [...closedStatuses] } } }),
      db.callLead.count({ where: { ...activeCallLeadWhere, status: "FOLLOW_UP" } }),
      db.callLead.count({ where: { ...activeCallLeadWhere, assignedToId: null } }),
      db.callLead.count({ where: { ...activeCallLeadWhere, isImportant: true } }),
      db.callLead.count({ where: { ...activeCallLeadWhere, formSubmissions: { some: submittedFormWhere } } }),
      db.callLead.count({ where: { ...activeCallLeadWhere, sheetSyncedAt: { not: null } } }),
    ]).then(([open, followUp, unassigned, important, filledForm, synced]) => ({ open, followUp, unassigned, important, filledForm, synced })),
  ]);
  const totalPages = Math.max(1, Math.ceil(totalLeads / pageSize));
  const currentPage = Math.min(requestedPage, totalPages);
  const leads = await db.callLead.findMany({
    where: filteredWhere,
    include: {
      assignedTo: { select: { id: true, username: true, email: true, department: true } },
      sessions: {
        include: {
          companyPhone: {
            select: { label: true, phoneNumber: true },
          },
        },
        orderBy: { firstRingAt: "desc" },
        take: 50,
      },
      activities: {
        include: {
          user: { select: { username: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      },
      // Include form submissions to determine if a real form was submitted
      formSubmissions: {
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          status: true,
          submittedAt: true,
          name: true,
          city: true,
          propertyType: true,
          mapsLocation: true,
          formToken: true,
          deletedAt: true,
        },
      },
      // Include latest WhatsApp queue item for status visibility
      whatsappQueueItems: {
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          status: true,
          lastError: true,
          formToken: true,
          sentAt: true,
          failedAt: true,
          queuedAt: true,
        },
      },
      _count: { select: { sessions: true, followUps: true } },
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    skip: (currentPage - 1) * pageSize,
    take: pageSize,
  });
  const leadIds = leads.map((lead) => lead.id);
  // Combine incoming/outgoing counts into a single groupBy query
  const sessionDirectionCounts = leadIds.length
    ? await db.callSession.groupBy({
        by: ["leadId", "callDirection"],
        where: {
          leadId: { in: leadIds },
          callDirection: { in: ["INCOMING", "OUTGOING"] },
        },
        _count: { _all: true },
      })
    : [];

  const incomingCountByLeadId = new Map<string, number>();
  const outgoingCountByLeadId = new Map<string, number>();

  for (const item of sessionDirectionCounts) {
    if (item.callDirection === "INCOMING") {
      incomingCountByLeadId.set(item.leadId, item._count._all);
    } else if (item.callDirection === "OUTGOING") {
      outgoingCountByLeadId.set(item.leadId, item._count._all);
    }
  }

  const rows: CallLeadRow[] = leads.map((lead) => {
    // Find the latest outgoing session and latest duration session from pre-fetched relation
    const latestOutgoingSession = lead.sessions.find((s) => s.callDirection === "OUTGOING") ?? null;
    const latestDurationSession = lead.sessions.find((s) => s.durationSeconds !== null) ?? null;

    // Determine form submission status from FormSubmission table (source of truth)
    const latestFormSubmission = lead.formSubmissions.find((submission) => !submission.deletedAt) ?? null;
    const submittedFormData = lead.formSubmissions.find(
      (submission) => submission.status === "FORM_SUBMITTED" && !submission.deletedAt,
    ) ?? null;
    const hasSubmittedForm = Boolean(submittedFormData);

    // Determine WhatsApp status from latest queue item
    const latestWaQueueItem = lead.whatsappQueueItems[0] ?? null;

    return {
      id: lead.id,
      phone: lead.phone,
      displayName: lead.displayName,
      email: lead.email,
      city: lead.city,
      address: lead.address,
      ownershipType: lead.ownershipType,
      language: lead.language,
      message: lead.message,
      status: lead.status,
      assignedToId: lead.assignedToId,
      lastCompanyPhone: lead.lastCompanyPhone,
      lastContactedAt: lead.lastContactedAt,
      nextFollowUpAt: lead.nextFollowUpAt,
      notes: lead.notes,
      isImportant: lead.isImportant,
      locationSent: lead.locationSent,
      instagramLeadId: lead.instagramLeadId,
      sheetSyncedAt: lead.sheetSyncedAt,
      sheetSyncWarning: lead.sheetSyncWarning,
      updatedAt: lead.updatedAt,
      assignedTo: lead.assignedTo,
      sessions: lead.sessions,
      incomingCallCount: incomingCountByLeadId.get(lead.id) || 0,
      latestOutgoingSession,
      latestDurationSession,
      outgoingCallCount: outgoingCountByLeadId.get(lead.id) || 0,
      activities: lead.activities,
      _count: lead._count,
      // Form and WhatsApp visibility
      hasSubmittedForm,
      submittedFormData,
      formSubmission: submittedFormData ?? latestFormSubmission,
      whatsappStatus: hasSubmittedForm ? "FORM_SUBMITTED" : latestWaQueueItem?.status ?? null,
      lastWhatsAppError: latestWaQueueItem?.lastError ?? null,
      formToken: submittedFormData?.formToken ?? latestWaQueueItem?.formToken ?? latestFormSubmission?.formToken ?? null,
    };
  });

  return (
    <CallLeadsPage
      key={JSON.stringify({ currentPage, pageSize, search, queue, agent: params.agent, filledFormOnly })}
      agents={agents}
      filterFilledForm={filledFormOnly}
      initialAgentId={params.agent || "ALL"}
      initialQueue={queue}
      initialSearch={search}
      leads={rows}
      pagination={{ currentPage, pageSize, totalLeads, totalPages }}
      queueCounts={queueCounts}
    />
  );
}
