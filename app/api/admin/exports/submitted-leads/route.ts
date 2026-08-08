import { db } from "@/app/lib/db";
import { getCurrentUser } from "@/app/lib/session";
import {
  buildSubmittedLeadsCsv,
  type SubmittedLeadExportRow,
} from "@/app/lib/submitted-leads-csv";

export const dynamic = "force-dynamic";

function iso(value: Date | null | undefined) {
  return value?.toISOString() ?? "";
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Authentication required." }, { status: 401 });
  if (user.role !== "ADMIN") {
    return Response.json({ error: "Administrator access required." }, { status: 403 });
  }

  const submissions = await db.formSubmission.findMany({
    where: { status: "FORM_SUBMITTED", deletedAt: null },
    orderBy: [{ submittedAt: "desc" }, { createdAt: "desc" }],
    select: {
      id: true, submittedAt: true, name: true, phone: true, city: true,
      propertyType: true, mapsLocation: true,
      callLead: {
        select: {
          id: true, status: true, email: true, language: true, provider: true,
          message: true, notes: true, firstCompanyPhone: true, lastCompanyPhone: true,
          lastContactedAt: true, nextFollowUpAt: true, locationSent: true,
          sheetSyncedAt: true, sheetSyncWarning: true,
          assignedTo: { select: { username: true } },
        },
      },
      whatsappLead: {
        select: { id: true, status: true, account: { select: { label: true } } },
      },
      queueItem: {
        select: { status: true, sentAt: true, account: { select: { label: true } } },
      },
    },
  });

  const rows: SubmittedLeadExportRow[] = submissions.map((submission) => ({
    submittedAt: iso(submission.submittedAt),
    submissionId: submission.id,
    name: submission.name ?? "",
    phone: submission.phone,
    city: submission.city ?? "",
    propertyType: submission.propertyType ?? "",
    mapsLocation: submission.mapsLocation ?? "",
    callLeadId: submission.callLead?.id ?? "",
    callLeadStatus: submission.callLead?.status ?? "",
    assignedAgent: submission.callLead?.assignedTo?.username ?? "",
    email: submission.callLead?.email ?? "",
    language: submission.callLead?.language ?? "",
    provider: submission.callLead?.provider ?? "",
    requirement: submission.callLead?.message ?? "",
    notes: submission.callLead?.notes ?? "",
    firstCompanyPhone: submission.callLead?.firstCompanyPhone ?? "",
    lastCompanyPhone: submission.callLead?.lastCompanyPhone ?? "",
    lastContactedAt: iso(submission.callLead?.lastContactedAt),
    nextFollowUpAt: iso(submission.callLead?.nextFollowUpAt),
    locationSent: submission.callLead?.locationSent ? "Yes" : "No",
    whatsappLeadId: submission.whatsappLead?.id ?? "",
    whatsappAccount: submission.queueItem?.account?.label ?? submission.whatsappLead?.account?.label ?? "",
    messageStatus: submission.queueItem?.status ?? submission.whatsappLead?.status ?? "",
    messageSentAt: iso(submission.queueItem?.sentAt),
    sheetSyncedAt: iso(submission.callLead?.sheetSyncedAt),
    sheetSyncWarning: submission.callLead?.sheetSyncWarning ?? "",
  }));

  const csv = "\uFEFF" + buildSubmittedLeadsCsv(rows);
  const date = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": 'attachment; filename="submitted-leads-' + date + '.csv"',
      "Content-Type": "text/csv; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
