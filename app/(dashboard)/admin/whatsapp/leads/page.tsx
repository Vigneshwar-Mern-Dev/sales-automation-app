export const dynamic = "force-dynamic";

import type { Prisma } from "@prisma/client";
import { db } from "@/app/lib/db";
import { WhatsAppLeadStatus } from "@/app/lib/prisma-enums";
import { getPublicCrmFormUrl, getPublicCrmUrl } from "@/app/lib/public-crm-url";
import { evaluateWhatsAppRetry } from "@/app/lib/whatsapp-retry";
import { hasCompletedWhatsAppDelivery } from "@/app/lib/whatsapp-delivery-status";
import {
  buildWhatsAppQueueEstimates,
  type WhatsAppQueueEstimate,
} from "@/app/lib/whatsapp-queue-eta";
import { WhatsAppLeadsClient } from "./whatsapp-leads-client";

const PAGE_SIZE = 15;
const ACTIVE_QUEUE_STATUSES = ["QUEUED", "SENDING"] as const;
const CLOSED_FORM_STATUS = "FORM_SUBMITTED";
const FORM_TABS = ["all", "not_opened", "opened", "submitted"] as const;

type PageProps = {
  searchParams: Promise<{ page?: string; q?: string; tab?: string }>;
};

type FormTrackableLead = {
  formSubmittedAt: Date | null;
  formSubmissions: Array<{ status: string }>;
};

type ClassifiableLead = FormTrackableLead & {
  id: string;
  phone: string;
  status: string;
  lastError: string | null;
  queueItems: Array<{
    status: string;
    lastError: string | null;
    queuedAt: Date;
    sendAfterAt: Date;
    updatedAt: Date;
  }>;
};

type FormLifecycleBucket = "not_opened" | "opened" | "submitted";

function hasSubmittedForm(lead: FormTrackableLead) {
  return lead.formSubmissions.some((submission) => submission.status === CLOSED_FORM_STATUS);
}

function latestQueueItem(lead: ClassifiableLead) {
  return lead.queueItems[0] ?? null;
}

function hasFailedSendState(lead: ClassifiableLead) {
  if (hasCompletedWhatsAppDelivery(lead.queueItems.map((item) => item.status))) {
    return false;
  }
  return lead.status === WhatsAppLeadStatus.FAILED || latestQueueItem(lead)?.status === "FAILED";
}

function hasOpenedForm(lead: FormTrackableLead) {
  return lead.formSubmissions.some((submission) =>
    submission.status === "OPENED" || submission.status === "FORM_STARTED",
  );
}

function formLifecycleBucket(lead: FormTrackableLead): FormLifecycleBucket {
  if (hasSubmittedForm(lead) || lead.formSubmittedAt) return "submitted";
  if (hasOpenedForm(lead)) return "opened";
  return "not_opened";
}

function matchesTab(lead: ClassifiableLead, tab: string) {
  return tab === "all" || formLifecycleBucket(lead) === tab;
}

function tabCounts(leads: ClassifiableLead[]) {
  const counts = {
    all: leads.length,
    not_opened: 0,
    opened: 0,
    submitted: 0,
  };

  for (const lead of leads) {
    counts[formLifecycleBucket(lead)] += 1;
  }

  return counts;
}

export default async function AdminWhatsAppLeadsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10));
  const q = params.q ?? "";
  const requestedTab = params.tab ?? "all";
  const tab = FORM_TABS.includes(requestedTab as (typeof FORM_TABS)[number]) ? requestedTab : "all";
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
  const queryNow = new Date();
  const todayStart = new Date(queryNow);
  todayStart.setHours(0, 0, 0, 0);
  const sentHistoryStart = new Date(Math.min(todayStart.getTime(), queryNow.getTime() - 60 * 60 * 1000));

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
    formSubmittedAt: true,
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

  const [tabCandidates, searchedCandidates, incomingCallLeads, activeQueueItems, waAccounts, sentItemsToday] = await Promise.all([
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
        accountId: true,
        whatsappLeadId: true,
        phone: true,
        status: true,
        queuedAt: true,
        sendAfterAt: true,
      },
    }),
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
        select: {
          id: true,
          phone: true,
          status: true,
          formSubmittedAt: true,
          queueItems: {
            where: { deletedAt: null, isArchived: false },
            orderBy: [{ queuedAt: "desc" }],
            select: { status: true },
          },
          formSubmissions: {
            where: { deletedAt: null },
            select: { status: true },
          },
        },
      })
    : [];

  const waLeadByPhone = new Map(allWaLeadsByPhone.map((lead) => [lead.phone, lead]));
  const serverNow = queryNow;
  const estimates = buildWhatsAppQueueEstimates(activeQueueItems, waAccounts, sentItemsToday, serverNow);
  const estimateByLeadId = new Map<string, WhatsAppQueueEstimate>();
  const estimateByPhone = new Map<string, WhatsAppQueueEstimate>();
  activeQueueItems.forEach((item) => {
    const estimate = estimates.get(item.id);
    if (!estimate) return;
    estimateByLeadId.set(item.whatsappLeadId, estimate);
    if (!estimateByPhone.has(item.phone)) estimateByPhone.set(item.phone, estimate);
  });

  const avgDelay = waAccounts.length
    ? Math.round(waAccounts.reduce((sum, account) => sum + (account.minDelaySeconds + account.maxDelaySeconds) / 2, 0) / waAccounts.length)
    : 120;
  const serverTime = serverNow.getTime();

  const leadsWithTargetTime = orderedLeads.map((lead) => {
    const eta = estimateByLeadId.get(lead.id) ?? null;
    const submittedForm = lead.formSubmissions.find((submission) => submission.status === CLOSED_FORM_STATUS) ?? null;
    const latestFormSubmission = lead.formSubmissions[0] ?? null;
    const latestQueueItem = lead.queueItems[0] ?? null;
    const effectiveFormToken = latestQueueItem?.formToken ?? lead.formToken ?? latestFormSubmission?.formToken ?? null;
    return {
      ...lead,
      targetTime: eta?.earliestAt ?? null,
      eta,
      latestQueueItem,
      formSubmission: submittedForm ?? latestFormSubmission,
      hasSubmittedForm: Boolean(submittedForm || lead.formSubmittedAt),
      formToken: effectiveFormToken,
      publicFormUrl: publicBaseUrl && effectiveFormToken ? getPublicCrmFormUrl(effectiveFormToken) : null,
      accountLabel: lead.account?.label ?? lead.preferredAccount?.label ?? null,
      retryEligibility: evaluateWhatsAppRetry(lead),
    };
  });

  const callLeadsWithWaStatus = incomingCallLeads.map((callLead) => {
    const waLead = waLeadByPhone.get(callLead.phone);
    const eta = estimateByPhone.get(callLead.phone) ?? null;

    return {
      ...callLead,
      waStatus: waLead
        ? hasCompletedWhatsAppDelivery(waLead.queueItems.map((item) => item.status))
          ? "SENT"
          : waLead.status
        : null,
      formStatus: waLead ? formLifecycleBucket(waLead) : null,
      waLeadId: waLead?.id ?? null,
      queuePosition: eta?.position ?? null,
      targetTime: eta?.earliestAt ?? null,
      eta,
      callStatus: callLead.sessions[0]?.status ?? null,
      callDuration: callLead.sessions[0]?.durationSeconds ?? null,
    };
  });

  const failedCandidates = tabCandidates.filter(hasFailedSendState);
  const retryPreviewRows = failedCandidates.map((lead) => ({
    lead,
    eligibility: evaluateWhatsAppRetry(lead),
  }));
  const retryableCount = retryPreviewRows.filter((row) => row.eligibility.retryable).length;

  return (
    <WhatsAppLeadsClient
      leads={leadsWithTargetTime}
      failedCount={failedCandidates.length}
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
      publicUrlError={publicUrlError}
      initialSearch={q}
      activeTab={tab}
      tabCounts={counts}
    />
  );
}
