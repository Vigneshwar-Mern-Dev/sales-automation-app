export const dynamic = "force-dynamic";

import type { Prisma } from "@prisma/client";
import { db } from "@/app/lib/db";
import { WhatsAppLeadStatus } from "@/app/lib/prisma-enums";
import { getPublicCrmFormUrl, getPublicCrmUrl } from "@/app/lib/public-crm-url";
import { evaluateWhatsAppRetry } from "@/app/lib/whatsapp-retry";
import { WhatsAppLeadsClient } from "./whatsapp-leads-client";

const PAGE_SIZE = 15;
const ACTIVE_QUEUE_STATUSES = ["QUEUED", "SENDING"] as const;
const CLOSED_FORM_STATUS = "FORM_SUBMITTED";

type PageProps = {
  searchParams: Promise<{ page?: string; q?: string; tab?: string }>;
};

type ClassifiableLead = {
  id: string;
  phone: string;
  status: string;
  lastError: string | null;
  lastReplyAt: Date | null;
  queueItems: Array<{
    status: string;
    lastError: string | null;
    queuedAt: Date;
    sendAfterAt: Date;
    updatedAt: Date;
  }>;
  formSubmissions: Array<{ status: string }>;
};

type LifecycleBucket = "queue" | "awaiting" | "failed" | "replied" | "submitted" | "other";

function hasSubmittedForm(lead: ClassifiableLead) {
  return lead.formSubmissions.some((submission) => submission.status === CLOSED_FORM_STATUS);
}

function latestQueueItem(lead: ClassifiableLead) {
  return lead.queueItems[0] ?? null;
}

function hasActiveQueueItem(lead: ClassifiableLead) {
  return lead.queueItems.some((item) => ACTIVE_QUEUE_STATUSES.includes(item.status as (typeof ACTIVE_QUEUE_STATUSES)[number]));
}

function hasFailedSendState(lead: ClassifiableLead) {
  return lead.status === WhatsAppLeadStatus.FAILED || latestQueueItem(lead)?.status === "FAILED";
}

function hasReplyState(lead: ClassifiableLead) {
  return lead.status === WhatsAppLeadStatus.REPLIED || Boolean(lead.lastReplyAt);
}

function primaryLifecycleBucket(lead: ClassifiableLead): LifecycleBucket {
  if (hasSubmittedForm(lead)) return "submitted";
  if (hasReplyState(lead)) return "replied";
  if (hasFailedSendState(lead)) return "failed";
  if (hasActiveQueueItem(lead)) return "queue";
  if (latestQueueItem(lead)?.status === "SENT") return "awaiting";
  return "other";
}

function matchesTab(lead: ClassifiableLead, tab: string) {
  return tab === "all" || primaryLifecycleBucket(lead) === tab;
}

function tabCounts(leads: ClassifiableLead[]) {
  const counts = {
    all: leads.length,
    queue: 0,
    awaiting: 0,
    failed: 0,
    replied: 0,
    submitted: 0,
  };

  for (const lead of leads) {
    const bucket = primaryLifecycleBucket(lead);
    if (bucket !== "other") counts[bucket] += 1;
  }

  return counts;
}

export default async function AdminWhatsAppLeadsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10));
  const q = params.q ?? "";
  const tab = params.tab ?? "all";
  const skip = (page - 1) * PAGE_SIZE;
  let publicBaseUrl = "";
  let publicUrlError: string | null = null;

  try {
    publicBaseUrl = getPublicCrmUrl();
  } catch (error) {
    publicUrlError = error instanceof Error ? error.message : "Public CRM URL is not configured.";
  }

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  sevenDaysAgo.setHours(0, 0, 0, 0);

  const searchFilter: Prisma.WhatsAppLeadWhereInput = q
    ? {
        OR: [
          { displayName: { contains: q, mode: "insensitive" } },
          { phone: { contains: q } },
        ],
      }
    : {};

  const baseLeadWhere: Prisma.WhatsAppLeadWhereInput = { deletedAt: null, isArchived: false };
  const visibleLeadSelect = {
    id: true,
    phone: true,
    status: true,
    lastError: true,
    lastReplyAt: true,
    queueItems: {
      where: { deletedAt: null, isArchived: false },
      orderBy: [{ queuedAt: "desc" as const }, { createdAt: "desc" as const }],
      select: { status: true, lastError: true, queuedAt: true, sendAfterAt: true, updatedAt: true },
    },
    formSubmissions: {
      where: { deletedAt: null },
      select: { status: true },
    },
  } satisfies Prisma.WhatsAppLeadSelect;

  const [tabCandidates, searchedCandidates, incomingCallLeads, activeQueueItems, waAccount] = await Promise.all([
    db.whatsAppLead.findMany({
      where: baseLeadWhere,
      orderBy: [{ updatedAt: "desc" }],
      select: visibleLeadSelect,
    }),
    db.whatsAppLead.findMany({
      where: { ...baseLeadWhere, ...searchFilter },
      orderBy: [{ updatedAt: "desc" }],
      select: visibleLeadSelect,
    }),
    db.callLead.findMany({
      where: {
        sessions: { some: { callDirection: "INCOMING" } },
        phone: { not: { startsWith: "UNKNOWN-" } },
        createdAt: { gte: sevenDaysAgo },
        deletedAt: null,
      },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        displayName: true,
        phone: true,
        updatedAt: true,
        createdAt: true,
        sessions: {
          where: { callDirection: "INCOMING" },
          orderBy: { firstRingAt: "desc" },
          take: 1,
          select: {
            status: true,
            durationSeconds: true,
          },
        },
      },
    }),
    db.whatsAppQueueItem.findMany({
      where: { status: { in: [...ACTIVE_QUEUE_STATUSES] }, deletedAt: null, isArchived: false },
      orderBy: [{ sendAfterAt: "asc" }, { queuedAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        whatsappLeadId: true,
        phone: true,
        status: true,
        queuedAt: true,
        sendAfterAt: true,
      },
    }),
    db.whatsAppAccount.findFirst({
      orderBy: { createdAt: "asc" },
      select: { minDelaySeconds: true, maxDelaySeconds: true, status: true, autoReplyEnabled: true },
    }),
  ]);

  const counts = tabCounts(tabCandidates);
  const matchingIds = searchedCandidates.filter((lead) => matchesTab(lead, tab)).map((lead) => lead.id);
  const pageIds = matchingIds.slice(skip, skip + PAGE_SIZE);
  const total = matchingIds.length;

  const leads = pageIds.length
    ? await db.whatsAppLead.findMany({
        where: { id: { in: pageIds } },
        select: {
          id: true,
          displayName: true,
          phone: true,
          message: true,
          status: true,
          accountId: true,
          account: { select: { label: true } },
          preferredAccountId: true,
          preferredAccount: { select: { label: true } },
          lastSentAt: true,
          lastReplyAt: true,
          lastReplySnippet: true,
          lastError: true,
          createdAt: true,
          updatedAt: true,
          formToken: true,
          formSubmittedAt: true,
          formName: true,
          formCity: true,
          formPropertyType: true,
          formMapsLocation: true,
          queueItems: {
            where: { deletedAt: null, isArchived: false },
            orderBy: [{ queuedAt: "desc" }, { createdAt: "desc" }],
            select: {
              id: true,
              status: true,
              formToken: true,
              queuedAt: true,
              sendAfterAt: true,
              sendingAt: true,
              sentAt: true,
              failedAt: true,
              lastError: true,
              createdAt: true,
              updatedAt: true,
            },
          },
          formSubmissions: {
            where: { deletedAt: null },
            orderBy: [{ submittedAt: "desc" }, { createdAt: "desc" }],
            select: {
              id: true,
              status: true,
              formToken: true,
              submittedAt: true,
              name: true,
              city: true,
              propertyType: true,
              mapsLocation: true,
            },
          },
        },
      })
    : [];

  const leadById = new Map(leads.map((lead) => [lead.id, lead]));
  const orderedLeads = pageIds.flatMap((id) => {
    const lead = leadById.get(id);
    return lead ? [lead] : [];
  });

  const incomingPhones = incomingCallLeads.map((cl) => cl.phone);
  const allWaLeadsByPhone = incomingPhones.length
    ? await db.whatsAppLead.findMany({
        where: { phone: { in: incomingPhones }, deletedAt: null, isArchived: false },
        select: { id: true, phone: true, status: true },
      })
    : [];

  const waLeadByPhone = new Map(allWaLeadsByPhone.map((lead) => [lead.phone, lead]));
  const queuePositionByPhone = new Map<string, number>();
  const targetTimeByLeadId = new Map<string, string>();
  const targetTimeByPhone = new Map<string, string>();
  let queuedPosition = 0;
  activeQueueItems.forEach((item) => {
    const targetTime = item.sendAfterAt.toISOString();
    targetTimeByLeadId.set(item.whatsappLeadId, targetTime);
    if (!targetTimeByPhone.has(item.phone)) {
      targetTimeByPhone.set(item.phone, targetTime);
    }
    // Only count QUEUED items for queue position numbering.
    // SENDING items are actively being processed, so they don't need a queue #.
    if (item.status === "QUEUED" && !queuePositionByPhone.has(item.phone)) {
      queuedPosition++;
      queuePositionByPhone.set(item.phone, queuedPosition);
    }
  });

  const avgDelay = waAccount ? Math.round((waAccount.minDelaySeconds + waAccount.maxDelaySeconds) / 2) : 120;
  // eslint-disable-next-line react-hooks/purity
  const serverTime = Date.now();

  const leadsWithTargetTime = orderedLeads.map((lead) => {
    const targetTime = targetTimeByLeadId.get(lead.id) ?? null;
    const submittedForm = lead.formSubmissions.find((submission) => submission.status === CLOSED_FORM_STATUS) ?? null;
    const latestFormSubmission = lead.formSubmissions[0] ?? null;
    const latestQueueItem = lead.queueItems[0] ?? null;
    const effectiveFormToken = latestQueueItem?.formToken ?? lead.formToken ?? latestFormSubmission?.formToken ?? null;
    const lifecycleBucket = primaryLifecycleBucket(lead);
    const lifecycleStatus =
      lifecycleBucket === "submitted"
        ? "FORM_SUBMITTED"
        : lifecycleBucket === "replied"
          ? "REPLIED"
          : lifecycleBucket === "failed"
            ? "FAILED"
            : latestQueueItem?.status ?? lead.status;

    return {
      ...lead,
      targetTime,
      latestQueueItem,
      formSubmission: submittedForm ?? latestFormSubmission,
      hasSubmittedForm: Boolean(submittedForm),
      formToken: effectiveFormToken,
      publicFormUrl: publicBaseUrl && effectiveFormToken ? getPublicCrmFormUrl(effectiveFormToken) : null,
      lifecycleStatus,
      accountLabel: lead.account?.label ?? lead.preferredAccount?.label ?? null,
      retryEligibility: evaluateWhatsAppRetry(lead),
    };
  });

  const callLeadsWithWaStatus = incomingCallLeads.map((callLead) => {
    const waLead = waLeadByPhone.get(callLead.phone);
    const queuePos = queuePositionByPhone.get(callLead.phone) ?? null;
    const targetTime = targetTimeByPhone.get(callLead.phone) ?? null;

    return {
      ...callLead,
      waStatus: waLead?.status ?? null,
      waLeadId: waLead?.id ?? null,
      queuePosition: queuePos,
      targetTime,
      callStatus: callLead.sessions[0]?.status ?? null,
      callDuration: callLead.sessions[0]?.durationSeconds ?? null,
    };
  });

  const failedCandidates = tabCandidates.filter((lead) => primaryLifecycleBucket(lead) === "failed");
  const retryPreviewRows = failedCandidates.map((lead) => ({
    lead,
    eligibility: evaluateWhatsAppRetry(lead),
  }));
  const retryableCount = retryPreviewRows.filter((row) => row.eligibility.retryable).length;

  return (
    <WhatsAppLeadsClient
      leads={leadsWithTargetTime}
      failedCount={counts.failed}
      retryPreview={{
        totalFailed: failedCandidates.length,
        retryable: retryableCount,
        skipped: failedCandidates.length - retryableCount,
        skippedRows: retryPreviewRows
          .filter((row) => !row.eligibility.retryable)
          .map((row) => ({ leadId: row.lead.id, phone: row.lead.phone, reasons: row.eligibility.reasons })),
      }}
      total={total}
      page={page}
      totalPages={Math.ceil(total / PAGE_SIZE)}
      incomingCallLeads={callLeadsWithWaStatus}
      avgDelaySeconds={avgDelay}
      totalQueued={activeQueueItems.length}
      accountStatus={waAccount?.status ?? "DISCONNECTED"}
      autoReplyEnabled={waAccount?.autoReplyEnabled ?? false}
      serverTime={serverTime}
      publicUrlError={publicUrlError}
      initialSearch={q}
      activeTab={tab}
      tabCounts={counts}
    />
  );
}
