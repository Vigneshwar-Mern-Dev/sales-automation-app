export type SubmittedLeadExportRow = {
  submittedAt: string;
  submissionId: string;
  name: string;
  phone: string;
  city: string;
  propertyType: string;
  mapsLocation: string;
  callLeadId: string;
  callLeadStatus: string;
  assignedAgent: string;
  email: string;
  language: string;
  provider: string;
  requirement: string;
  notes: string;
  firstCompanyPhone: string;
  lastCompanyPhone: string;
  lastContactedAt: string;
  nextFollowUpAt: string;
  locationSent: string;
  whatsappLeadId: string;
  whatsappAccount: string;
  messageStatus: string;
  messageSentAt: string;
  sheetSyncedAt: string;
  sheetSyncWarning: string;
};

const COLUMNS: Array<{ header: string; key: keyof SubmittedLeadExportRow }> = [
  { header: "Submitted At", key: "submittedAt" },
  { header: "Submission ID", key: "submissionId" },
  { header: "Customer Name", key: "name" },
  { header: "Phone", key: "phone" },
  { header: "City", key: "city" },
  { header: "Property Type", key: "propertyType" },
  { header: "Google Maps Location", key: "mapsLocation" },
  { header: "Call Lead ID", key: "callLeadId" },
  { header: "Call Lead Status", key: "callLeadStatus" },
  { header: "Assigned Agent", key: "assignedAgent" },
  { header: "Email", key: "email" },
  { header: "Language", key: "language" },
  { header: "Provider", key: "provider" },
  { header: "Requirement", key: "requirement" },
  { header: "Notes", key: "notes" },
  { header: "First Company Phone", key: "firstCompanyPhone" },
  { header: "Last Company Phone", key: "lastCompanyPhone" },
  { header: "Last Contacted At", key: "lastContactedAt" },
  { header: "Next Follow-up At", key: "nextFollowUpAt" },
  { header: "Location Sent", key: "locationSent" },
  { header: "WhatsApp Lead ID", key: "whatsappLeadId" },
  { header: "WhatsApp Account", key: "whatsappAccount" },
  { header: "Message Status", key: "messageStatus" },
  { header: "Message Sent At", key: "messageSentAt" },
  { header: "Sheet Synced At", key: "sheetSyncedAt" },
  { header: "Sheet Sync Warning", key: "sheetSyncWarning" },
];

function csvCell(value: string) {
  const safe = /^[\t\r\n ]*[=+\-@]/.test(value) ? "'" + value : value;
  return '"' + safe.replaceAll('"', '""') + '"';
}

export function buildSubmittedLeadsCsv(rows: SubmittedLeadExportRow[]) {
  const header = COLUMNS.map((column) => csvCell(column.header)).join(",");
  const body = rows.map((row) =>
    COLUMNS.map((column) => csvCell(row[column.key] ?? "")).join(","),
  );
  return [header, ...body].join("\r\n");
}
