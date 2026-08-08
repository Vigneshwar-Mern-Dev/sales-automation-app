"use server";

import { revalidatePath } from "next/cache";
import { db } from "./db";
import { requireRole, requireUser } from "./session";
import type { CallLeadStatus } from "@prisma/client";
import { LeadSource } from "./prisma-enums";
import { autoQueueWhatsAppForCaller } from "./whatsapp-auto-queue";

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function normalizeDigits(value: string | null | undefined) {
  return value ? value.replace(/\D/g, "") : "";
}

function normalizePhone(value: string) {
  let digits = normalizeDigits(value);

  if (digits.length === 12 && digits.startsWith("91")) {
    return `+${digits}`;
  }

  if (digits.length === 11 && digits.startsWith("0")) {
    digits = digits.slice(1);
  }

  if (digits.length === 10) {
    return `+91${digits}`;
  }

  return digits.length >= 8 ? `+${digits}` : null;
}

function parseFollowUp(value: string | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function optionalTrimmedUpdate(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function hasSheetReadyCallLeadDetails(lead: {
  displayName: string;
  email: string | null;
  city: string | null;
  address: string | null;
  ownershipType: string | null;
  language: string | null;
  message: string | null;
  notes: string | null;
  nextFollowUpAt: Date | null;
  locationSent: boolean;
  status: string;
}) {
  const nameLooksReal = lead.displayName.trim() && !/^caller\s+\d+$/i.test(lead.displayName.trim());
  const hasCustomerData = [
    lead.email,
    lead.city,
    lead.address,
    lead.ownershipType,
    lead.language,
    lead.message,
    lead.notes,
  ].some((value) => Boolean(value?.trim()));
  const hasNextStep = Boolean(lead.nextFollowUpAt);
  const hasFinalOutcome = ["NOT_INTERESTED", "CONVERTED", "CLOSED"].includes(lead.status);

  return Boolean(nameLooksReal && (hasCustomerData || lead.locationSent || hasNextStep || hasFinalOutcome));
}

async function syncCallLeadBackToSheet(lead: {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  language: string | null;
  address: string | null;
  ownershipType: string | null;
  locationSent: boolean;
  stage: string;
  assignedAgent: string | null;
  requirement: string | null;
  notes: string | null;
  nextFollowUpAt: Date | null;
  lastContactedAt: Date | null;
  incomingCallCount: number;
  outgoingCallCount: number;
  lastCallDirection: string | null;
  lastCallDurationSeconds: number | null;
  updatedAt: Date;
}) {
  const integration = await db.leadIntegration.findUnique({
    where: { source: LeadSource.CALLS },
  });

  if (!integration?.appScriptUrl || !integration.spreadsheetId || !integration.sheetName) {
    return "Call lead saved in CRM, but Call Leads sheet sync is not configured.";
  }

  try {
    const url = new URL(integration.appScriptUrl);
    const key = integration.secretToken?.replace(/^['"]|['"]$/g, "").trim();

    if (key) {
      url.searchParams.set("key", key);
    }

    const response = await fetch(url, {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "updateCallLead",
        sheetId: integration.spreadsheetId,
        sheetName: integration.sheetName,
        lead: {
          id: lead.id,
          name: lead.name,
          email: lead.email,
          phone: lead.phone,
          city: lead.city,
          language: lead.language,
          address: lead.address,
          ownershipType: lead.ownershipType,
          locationSent: lead.locationSent,
          stage: lead.stage,
          assignedAgent: lead.assignedAgent,
          requirement: lead.requirement,
          notes: lead.notes,
          nextFollowUpAt: lead.nextFollowUpAt?.toISOString() ?? null,
          lastContactedAt: lead.lastContactedAt?.toISOString() ?? null,
          incomingCallCount: lead.incomingCallCount,
          outgoingCallCount: lead.outgoingCallCount,
          lastCallDirection: lead.lastCallDirection,
          lastCallDurationSeconds: lead.lastCallDurationSeconds,
          updatedAt: lead.updatedAt.toISOString(),
        },
      }),
    });

    if (!response.ok) {
      return `Call lead saved in CRM, but Apps Script returned HTTP ${response.status}.`;
    }

    const payload = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      updated?: boolean;
      error?: string;
    };

    if (payload.ok === false) {
      return `Call lead saved in CRM, but sheet update failed: ${payload.error || "Apps Script error"}.`;
    }

    if (payload.updated !== true) {
      return "Call lead saved in CRM, but sheet update was not confirmed.";
    }

    return null;
  } catch (error) {
    return `Call lead saved in CRM, but sheet sync failed: ${getErrorMessage(error, "Unknown Apps Script error")}.`;
  }
}

function revalidateCallViews() {
  revalidatePath("/admin/calls");
  revalidatePath("/admin/calls/leads");
  revalidatePath("/admin/calls/missed");
  revalidatePath("/admin/calls/live");
}

export async function adminDeleteCallLeadsAction(leadIds: string[]) {
  try {
    const admin = await requireRole("ADMIN");

    if (!leadIds.length) {
      return { error: "No call leads selected." };
    }

    const now = new Date();
    await db.$transaction([
      db.callLead.updateMany({
        where: { id: { in: leadIds } },
        data: {
          isArchived: true,
          archivedAt: now,
          archivedBy: admin.id,
          deletedAt: now,
          deletedBy: admin.id,
        },
      }),
      db.callSession.updateMany({
        where: { leadId: { in: leadIds } },
        data: {
          isArchived: true,
          archivedAt: now,
          archivedBy: admin.id,
          deletedAt: now,
          deletedBy: admin.id,
        },
      }),
      db.callFollowUp.updateMany({
        where: { leadId: { in: leadIds } },
        data: {
          isArchived: true,
          archivedAt: now,
          archivedBy: admin.id,
          deletedAt: now,
          deletedBy: admin.id,
        },
      }),
      ...leadIds.map((leadId) =>
        db.callActivity.create({
          data: {
            leadId,
            userId: admin.id,
            actionType: "ARCHIVED",
            description: "Call lead archived by admin",
          },
        }),
      ),
    ]);

    revalidateCallViews();
    return { success: true };
  } catch (error) {
    console.error("Error deleting call leads:", error);
    return { error: getErrorMessage(error, "Deleting call leads failed.") };
  }
}

export async function adminDeleteCallSessionAction(sessionId: string) {
  try {
    const admin = await requireRole("ADMIN");

    if (!sessionId) {
      return { error: "Call session is required." };
    }

    const session = await db.callSession.findUnique({
      where: { id: sessionId },
      select: { id: true, leadId: true },
    });

    if (!session) {
      return { error: "Call session not found." };
    }

    const now = new Date();
    await db.$transaction([
      db.callSession.update({
        where: { id: session.id },
        data: {
          isArchived: true,
          archivedAt: now,
          archivedBy: admin.id,
          deletedAt: now,
          deletedBy: admin.id,
        },
      }),
      db.callActivity.create({
        data: {
          leadId: session.leadId,
          sessionId: session.id,
          userId: admin.id,
          actionType: "ARCHIVED",
          description: "Call session archived by admin",
        },
      }),
    ]);

    revalidateCallViews();
    return { success: true };
  } catch (error) {
    console.error("Error deleting call session:", error);
    return { error: getErrorMessage(error, "Deleting call session failed.") };
  }
}

export async function adminDeleteMissedCallbacksForLeadAction(sessionId: string) {
  try {
    const admin = await requireRole("ADMIN");

    if (!sessionId) {
      return { error: "Call session is required." };
    }

    const session = await db.callSession.findUnique({
      where: { id: sessionId },
      select: { leadId: true },
    });

    if (!session) {
      return { error: "Call session not found." };
    }

    const missedSessions = await db.callSession.findMany({
      where: {
        leadId: session.leadId,
        status: "MISSED",
        deletedAt: null,
      },
      select: { id: true },
    });

    const now = new Date();
    const result = await db.callSession.updateMany({
      where: {
        id: { in: missedSessions.map((missedSession) => missedSession.id) },
      },
      data: {
        isArchived: true,
        archivedAt: now,
        archivedBy: admin.id,
        deletedAt: now,
        deletedBy: admin.id,
      },
    });

    if (missedSessions.length) {
      await db.callActivity.create({
        data: {
          leadId: session.leadId,
          userId: admin.id,
          actionType: "ARCHIVED",
          description: `Archived ${missedSessions.length} missed callback session(s)`,
          metadata: { sessionIds: missedSessions.map((missedSession) => missedSession.id) },
        },
      });
    }

    revalidateCallViews();
    return { success: true, deletedCount: result.count };
  } catch (error) {
    console.error("Error deleting missed callbacks:", error);
    return { error: getErrorMessage(error, "Deleting missed callbacks failed.") };
  }
}

export async function adminAssignCallLeadAction(leadId: string, assignedToId: string | null) {
  try {
    const admin = await requireRole("ADMIN");
    let assigneeName = "Unassigned";

    if (assignedToId) {
      const assignee = await db.user.findFirst({
        where: { id: assignedToId, isActive: true },
        select: { username: true },
      });

      if (!assignee) {
        return { error: "Assigned user not found." };
      }

      assigneeName = assignee.username;
    }

    await db.callLead.update({
      where: { id: leadId },
      data: { assignedToId },
    });

    await db.callActivity.create({
      data: {
        leadId,
        userId: admin.id,
        actionType: "ASSIGNMENT_CHANGE",
        description: assignedToId ? `Call lead assigned to ${assigneeName}` : "Call lead unassigned",
      },
    });

    revalidateCallViews();
    return { success: true };
  } catch (error) {
    console.error("Error assigning call lead:", error);
    return { error: getErrorMessage(error, "Assigning call lead failed.") };
  }
}

export async function updateCallLeadStatusAction(leadId: string, status: CallLeadStatus) {
  try {
    const user = await requireUser();
    const lead = await db.callLead.findUnique({
      where: { id: leadId },
      select: { assignedToId: true, status: true },
    });

    if (!lead) {
      return { error: "Call lead not found." };
    }

    if (user.role !== "ADMIN" && lead.assignedToId !== user.id) {
      return { error: "Only admins or the assigned agent can update this call status." };
    }

    await db.callLead.update({
      where: { id: leadId },
      data: {
        status,
        lastContactedAt: new Date(),
      },
    });

    await db.callActivity.create({
      data: {
        leadId,
        userId: user.id,
        actionType: "FOLLOW_UP_UPDATE",
        description: `Call lead status changed from ${lead.status} to ${status}`,
      },
    });

    revalidateCallViews();
    return { success: true };
  } catch (error) {
    console.error("Error updating call lead status:", error);
    return { error: getErrorMessage(error, "Updating call lead status failed.") };
  }
}

export async function toggleCallLeadImportantAction(leadId: string, isImportant: boolean) {
  try {
    const user = await requireUser();

    await db.callLead.update({
      where: { id: leadId },
      data: { isImportant },
    });

    await db.callActivity.create({
      data: {
        leadId,
        userId: user.id,
        actionType: "FOLLOW_UP_UPDATE",
        description: isImportant ? "Call lead marked important" : "Call lead unmarked important",
      },
    });

    revalidateCallViews();
    return { success: true };
  } catch (error) {
    console.error("Error updating call lead importance:", error);
    return { error: getErrorMessage(error, "Updating call lead importance failed.") };
  }
}

export async function createManualCallLeadAction(data: {
  displayName: string;
  phone: string;
  email?: string;
  city?: string;
  language?: string;
  address?: string;
  ownershipType?: string;
  locationSent?: boolean;
  message?: string;
  notes?: string;
}) {
  try {
    const user = await requireUser();
    const phone = normalizePhone(data.phone);

    if (!phone) {
      return { error: "Enter a valid phone number." };
    }

    const displayName = data.displayName.trim() || `Caller ${phone.slice(-4)}`;
    const existingLead = await db.callLead.findUnique({
      where: { phone },
      select: { id: true },
    });

    const lead = await db.callLead.upsert({
      where: { phone },
      update: {
        displayName,
        email: optionalTrimmedUpdate(data.email),
        city: optionalTrimmedUpdate(data.city),
        language: optionalTrimmedUpdate(data.language),
        address: optionalTrimmedUpdate(data.address),
        ownershipType: optionalTrimmedUpdate(data.ownershipType),
        locationSent: data.locationSent === undefined ? undefined : Boolean(data.locationSent),
        message: optionalTrimmedUpdate(data.message),
        notes: optionalTrimmedUpdate(data.notes),
        lastContactedAt: new Date(),
      },
      create: {
        phone,
        displayName,
        email: data.email?.trim() || null,
        city: data.city?.trim() || null,
        language: data.language?.trim() || null,
        address: data.address?.trim() || null,
        ownershipType: data.ownershipType?.trim() || null,
        locationSent: Boolean(data.locationSent),
        message: data.message?.trim() || null,
        notes: data.notes?.trim() || null,
      },
    });

    await db.callActivity.create({
      data: {
        leadId: lead.id,
        userId: user.id,
        actionType: "NOTE_ADDED",
        description: existingLead ? "Manual call lead details updated" : "Manual call lead created",
      },
    });

    if (!existingLead) {
      let companyPhone = await db.companyPhone.findFirst();
      if (!companyPhone) {
        companyPhone = await db.companyPhone.create({
          data: {
            phoneNumber: "MANUAL",
            label: "Manual Entry Phone",
            deviceId: "MANUAL_DEVICE",
            authTokenHash: "MANUAL",
          },
        });
      }

      await db.callSession.create({
        data: {
          leadId: lead.id,
          companyPhoneId: companyPhone.id,
          callerNumber: lead.phone,
          callDirection: "INCOMING",
          status: "COMPLETED",
          firstRingAt: new Date(),
          durationSeconds: 0,
        },
      });
    }

    // Route the manual automation through the same company phone as the most
    // recent call session. If there is no session, the automation is skipped
    // rather than guessing a sender.
    const routingSession = await db.callSession.findFirst({
      where: { leadId: lead.id, deletedAt: null, isArchived: false },
      orderBy: { firstRingAt: "desc" },
      select: { companyPhoneId: true },
    });
    await autoQueueWhatsAppForCaller(
      lead.phone,
      displayName,
      "MISSED",
      lead.id,
      routingSession?.companyPhoneId,
    );

    revalidateCallViews();
    revalidatePath("/admin/whatsapp/leads");
    return { success: true, leadId: lead.id, updated: Boolean(existingLead) };
  } catch (error) {
    console.error("Error creating manual call lead:", error);
    return { error: getErrorMessage(error, "Manual call lead save failed.") };
  }
}

export async function updateCallLeadDetailsAction(
  leadId: string,
  data: {
    displayName: string;
    phone: string;
    email?: string;
    city?: string;
    language?: string;
    address?: string;
    ownershipType?: string;
    locationSent?: boolean;
    message?: string;
  },
) {
  try {
    await requireUser();

    const displayName = data.displayName.trim() || `Caller ${data.phone.slice(-4)}`;
    const phone = data.phone.trim();

    if (!phone) {
      return { error: "Phone number is required." };
    }

    await db.callLead.update({
      where: { id: leadId },
      data: {
        displayName,
        phone,
        email: data.email?.trim() || null,
        city: data.city?.trim() || null,
        language: data.language?.trim() || null,
        address: data.address?.trim() || null,
        ownershipType: data.ownershipType?.trim() || null,
        locationSent: Boolean(data.locationSent),
        message: data.message?.trim() || null,
        lastContactedAt: new Date(),
      },
    });

    await db.callActivity.create({
      data: {
        leadId,
        actionType: "NOTE_ADDED",
        description: "Call lead customer details updated",
      },
    });

    revalidateCallViews();
    return { success: true };
  } catch (error) {
    console.error("Error updating call lead details:", error);
    return { error: getErrorMessage(error, "Call lead details update failed.") };
  }
}

export async function updateCallLeadWorkflowAction(
  leadId: string,
  data: {
    status: CallLeadStatus;
    notes?: string;
    nextFollowUpAt?: string;
    assignedToId?: string;
  },
) {
  try {
    const user = await requireUser();
    const nextFollowUpAt = parseFollowUp(data.nextFollowUpAt);
    const notes = data.notes?.trim() || null;
    const assignedToId = data.assignedToId?.trim() || null;

    if (assignedToId) {
      const assignee = await db.user.findFirst({
        where: { id: assignedToId, isActive: true },
        select: { id: true, username: true },
      });

      if (!assignee) {
        return { error: "Assigned user not found." };
      }
    }

    const currentLead = await db.callLead.findUnique({
      where: { id: leadId },
      select: { assignedToId: true },
    });

    await db.callLead.update({
      where: { id: leadId },
      data: {
        status: data.status,
        notes,
        nextFollowUpAt,
        assignedToId,
        lastContactedAt: new Date(),
      },
    });

    if (nextFollowUpAt) {
      await db.callFollowUp.create({
        data: {
          leadId,
          dueAt: nextFollowUpAt,
          assignedToId: assignedToId || user.id,
          note: notes,
        },
      });
    }

    if (assignedToId && currentLead?.assignedToId !== assignedToId) {
      await db.callActivity.create({
        data: {
          leadId,
          userId: user.id,
          actionType: "ASSIGNMENT_CHANGE",
          description: "Call lead claimed by user",
        },
      });
    }

    await db.callActivity.create({
      data: {
        leadId,
        userId: user.id,
        actionType: nextFollowUpAt ? "FOLLOW_UP_UPDATE" : "NOTE_ADDED",
        description: nextFollowUpAt
          ? `Call lead follow-up scheduled for ${nextFollowUpAt.toISOString()}`
          : `Call lead status updated to ${data.status}`,
      },
    });

    revalidateCallViews();
    return { success: true };
  } catch (error) {
    console.error("Error updating call lead workflow:", error);
    return { error: getErrorMessage(error, "Call lead workflow update failed.") };
  }
}

export async function saveCallLeadToSheetAction(leadId: string) {
  try {
    const user = await requireUser();
    const callLead = await db.callLead.findUnique({
      where: { id: leadId },
      include: {
        assignedTo: { select: { username: true } },
        sessions: {
          where: { durationSeconds: { not: null } },
          orderBy: { firstRingAt: "desc" },
          take: 1,
        },
      },
    });

    if (!callLead) {
      return { error: "Call lead not found." };
    }

    if (!hasSheetReadyCallLeadDetails(callLead)) {
      const warning = "Saved in CRM only. Add real customer details before sending this lead to the sheet.";

      await db.callLead.update({
        where: { id: callLead.id },
        data: {
          sheetSyncWarning: warning,
        },
      });

      await db.callActivity.create({
        data: {
          leadId: callLead.id,
          userId: user.id,
          actionType: "NOTE_ADDED",
          description: warning,
        },
      });

      revalidateCallViews();
      return { success: true, warning };
    }

    const [incomingCount, outgoingCount] = await Promise.all([
      db.callSession.count({ where: { leadId: callLead.id, callDirection: "INCOMING" } }),
      db.callSession.count({ where: { leadId: callLead.id, callDirection: "OUTGOING" } }),
    ]);
    const latestDurationSession = callLead.sessions[0] || null;

    const warning = await syncCallLeadBackToSheet({
      id: callLead.id,
      name: callLead.displayName,
      email: callLead.email,
      phone: callLead.phone,
      city: callLead.city,
      language: callLead.language,
      address: callLead.address,
      ownershipType: callLead.ownershipType,
      locationSent: callLead.locationSent,
      stage: callLead.status,
      assignedAgent: callLead.assignedTo?.username || null,
      requirement: callLead.message,
      notes: callLead.notes,
      nextFollowUpAt: callLead.nextFollowUpAt,
      lastContactedAt: callLead.lastContactedAt,
      incomingCallCount: incomingCount,
      outgoingCallCount: outgoingCount,
      lastCallDirection: latestDurationSession?.callDirection || null,
      lastCallDurationSeconds: latestDurationSession?.durationSeconds || null,
      updatedAt: callLead.updatedAt,
    });

    await db.callLead.update({
      where: { id: callLead.id },
      data: {
        sheetSyncedAt: warning ? null : new Date(),
        sheetSyncWarning: warning,
      },
    });

    await db.callActivity.create({
      data: {
        leadId: callLead.id,
        userId: user.id,
        actionType: "NOTE_ADDED",
        description: warning
          ? `Call lead sheet sync warning: ${warning}`
          : "Call lead synced to Call Leads sheet",
      },
    });

    revalidateCallViews();
    return { success: true, warning };
  } catch (error) {
    console.error("Error saving call lead to sheet:", error);
    return { error: getErrorMessage(error, "Saving call lead to sheet failed.") };
  }
}

export async function syncCallLeadToSheetBackground(leadId: string) {
  try {
    const callLead = await db.callLead.findUnique({
      where: { id: leadId },
      include: {
        assignedTo: { select: { username: true } },
        sessions: {
          where: { durationSeconds: { not: null } },
          orderBy: { firstRingAt: "desc" },
          take: 1,
        },
      },
    });

    if (!callLead) {
      console.log(`[sheet-sync-bg] Call lead ${leadId} not found.`);
      return;
    }

    if (!hasSheetReadyCallLeadDetails(callLead)) {
      console.log(`[sheet-sync-bg] Call lead ${leadId} details not sheet-ready yet.`);
      return;
    }

    const [incomingCount, outgoingCount] = await Promise.all([
      db.callSession.count({ where: { leadId: callLead.id, callDirection: "INCOMING" } }),
      db.callSession.count({ where: { leadId: callLead.id, callDirection: "OUTGOING" } }),
    ]);
    const latestDurationSession = callLead.sessions[0] || null;

    const warning = await syncCallLeadBackToSheet({
      id: callLead.id,
      name: callLead.displayName,
      email: callLead.email,
      phone: callLead.phone,
      city: callLead.city,
      language: callLead.language,
      address: callLead.address,
      ownershipType: callLead.ownershipType,
      locationSent: callLead.locationSent,
      stage: callLead.status,
      assignedAgent: callLead.assignedTo?.username || null,
      requirement: callLead.message,
      notes: callLead.notes,
      nextFollowUpAt: callLead.nextFollowUpAt,
      lastContactedAt: callLead.lastContactedAt,
      incomingCallCount: incomingCount,
      outgoingCallCount: outgoingCount,
      lastCallDirection: latestDurationSession?.callDirection || null,
      lastCallDurationSeconds: latestDurationSession?.durationSeconds || null,
      updatedAt: callLead.updatedAt,
    });

    await db.callLead.update({
      where: { id: callLead.id },
      data: {
        sheetSyncedAt: warning ? null : new Date(),
        sheetSyncWarning: warning,
      },
    });

    await db.callActivity.create({
      data: {
        leadId: callLead.id,
        actionType: "NOTE_ADDED",
        description: warning
          ? `System auto-sync to sheet warning: ${warning}`
          : "System auto-synced lead to Call Leads sheet",
      },
    });

    revalidateCallViews();
  } catch (error) {
    console.error("[sheet-sync-bg] Background sheet sync failed:", error);
  }
}
