import process from "node:process";
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const apply = process.argv.includes("--apply");

try {
  const submissions = await db.formSubmission.findMany({
    where: { status: "FORM_SUBMITTED", deletedAt: null },
    orderBy: { submittedAt: "asc" },
    select: {
      id: true, phone: true, name: true, city: true, propertyType: true,
      mapsLocation: true, submittedAt: true, callLeadId: true,
      whatsappLeadId: true, queueItemId: true,
      callLead: {
        select: {
          displayName: true, city: true, ownershipType: true,
          address: true, locationSent: true,
        },
      },
      whatsappLead: {
        select: {
          status: true, formName: true, formCity: true,
          formPropertyType: true, formMapsLocation: true, formSubmittedAt: true,
        },
      },
      queueItem: { select: { status: true, formSubmittedAt: true } },
    },
  });

  const invalid = submissions.filter((submission) =>
    !submission.submittedAt || !submission.name || !submission.city ||
    !submission.propertyType || !submission.mapsLocation ||
    !submission.callLeadId || !submission.whatsappLeadId,
  );
  const candidates = submissions.filter((submission) => {
    if (invalid.includes(submission)) return false;
    return (
      submission.callLead?.displayName !== submission.name ||
      submission.callLead?.city !== submission.city ||
      submission.callLead?.ownershipType !== submission.propertyType ||
      submission.callLead?.address !== submission.mapsLocation ||
      !submission.callLead?.locationSent ||
      submission.whatsappLead?.status !== "FORM_SUBMITTED" ||
      submission.whatsappLead?.formName !== submission.name ||
      submission.whatsappLead?.formCity !== submission.city ||
      submission.whatsappLead?.formPropertyType !== submission.propertyType ||
      submission.whatsappLead?.formMapsLocation !== submission.mapsLocation ||
      !submission.whatsappLead?.formSubmittedAt ||
      (submission.queueItemId && (
        submission.queueItem?.status !== "FORM_SUBMITTED" ||
        !submission.queueItem?.formSubmittedAt
      ))
    );
  });

  console.log(JSON.stringify({
    mode: apply ? "apply" : "dry-run",
    submittedForms: submissions.length,
    invalidForms: invalid.length,
    reconciliationCandidates: candidates.length,
    phoneSuffixes: candidates.map((submission) => submission.phone.slice(-4)),
  }, null, 2));

  if (invalid.length) {
    throw new Error("Refusing reconciliation because submitted forms are missing required links or fields.");
  }

  if (apply) {
    for (const submission of candidates) {
      await db.$transaction([
        db.callLead.update({
          where: { id: submission.callLeadId },
          data: {
            displayName: submission.name,
            city: submission.city,
            ownershipType: submission.propertyType,
            address: submission.mapsLocation,
            locationSent: true,
          },
        }),
        db.whatsAppLead.update({
          where: { id: submission.whatsappLeadId },
          data: {
            status: "FORM_SUBMITTED",
            formName: submission.name,
            formCity: submission.city,
            formPropertyType: submission.propertyType,
            formMapsLocation: submission.mapsLocation,
            formSubmittedAt: submission.submittedAt,
          },
        }),
        ...(submission.queueItemId
          ? [
              db.whatsAppQueueItem.update({
                where: { id: submission.queueItemId },
                data: { status: "FORM_SUBMITTED", formSubmittedAt: submission.submittedAt },
              }),
            ]
          : []),
      ]);
    }
    console.log("Reconciled " + candidates.length + " submitted lead record(s).");
  }
} finally {
  await db.$disconnect();
}
