import { describe, it, expect } from "vitest";
import { randomBytes } from "crypto";

/**
 * Integration test: Multi-Phone WhatsApp Form Link Routing
 *
 * Simulates the end-to-end flow where two company phones receive calls from
 * different customers, and verifies that WhatsApp form links route submissions
 * to the correct CallLead without cross-contamination.
 *
 * This test exercises the pure logic layer (token generation, message rendering,
 * phone normalization, scheduling) without requiring a live database.
 */

// ── Replicated utility functions ─────────────────────────────────────────────

function normalizeIndianPhoneNumber(value: string | null | undefined) {
  if (!value) return null;
  let digits = value.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length >= 8) return `+${digits}`;
  return null;
}

function generateRandomCode(length = 24): string {
  const byteLength = Math.ceil((length * 3) / 4);
  return randomBytes(byteLength).toString("base64url").slice(0, length);
}

function renderWhatsAppMessage(
  template: string | null | undefined,
  name: string,
  formLink: string,
) {
  const defaultMessage = `Hi {{name}}!\n\nThank you for contacting ATM Franchise.\n\nPlease fill out your details using this secure link:\n{{formLink}}\n\nOur team will review your details and contact you shortly.`;
  const selectedTemplate = template?.trim() || defaultMessage;
  const rendered = selectedTemplate
    .replaceAll("{{name}}", name)
    .replaceAll("{{formLink}}", formLink)
    .trim();
  if (!formLink || rendered.includes(formLink)) return rendered;
  return `${rendered}\n\nPlease fill out your details using this secure link:\n${formLink}`;
}

function randomDelaySeconds(minimum: number, maximum: number) {
  const min = Math.max(5, Math.floor(Math.min(minimum, maximum)));
  const max = Math.max(min, Math.floor(Math.max(minimum, maximum)));
  return min + Math.floor(Math.random() * (max - min + 1));
}

// ── Simulated database (in-memory) ──────────────────────────────────────────

type SimCallLead = {
  id: string;
  phone: string;
  displayName: string;
  firstCompanyPhone: string;
  lastCompanyPhone: string;
};

type SimWhatsAppQueueItem = {
  id: string;
  callLeadId: string;
  phone: string;
  displayName: string;
  message: string;
  formToken: string;
  status: string;
  sendAfterAt: Date;
};

type SimFormSubmission = {
  id: string;
  formToken: string;
  callLeadId: string;
  phone: string;
  name: string;
  city: string;
  propertyType: string;
  mapsLocation: string;
  status: string;
};

class InMemoryDb {
  callLeads: SimCallLead[] = [];
  queueItems: SimWhatsAppQueueItem[] = [];
  formSubmissions: SimFormSubmission[] = [];

  findCallLeadByPhone(phone: string) {
    return this.callLeads.find((l) => l.phone === phone) ?? null;
  }

  findQueueItemByFormToken(token: string) {
    return this.queueItems.find((q) => q.formToken === token) ?? null;
  }

  findFormSubmissionByToken(token: string) {
    return this.formSubmissions.find((f) => f.formToken === token) ?? null;
  }
}

// ── Simulated call ingestion ─────────────────────────────────────────────────

function simulateIncomingCall(
  db: InMemoryDb,
  callerPhone: string,
  callerName: string,
  companyPhoneNumber: string,
) {
  const normalizedPhone = normalizeIndianPhoneNumber(callerPhone);
  if (!normalizedPhone) throw new Error("Invalid caller phone");

  let callLead = db.findCallLeadByPhone(normalizedPhone);
  if (!callLead) {
    callLead = {
      id: `lead-${randomBytes(4).toString("hex")}`,
      phone: normalizedPhone,
      displayName: callerName,
      firstCompanyPhone: companyPhoneNumber,
      lastCompanyPhone: companyPhoneNumber,
    };
    db.callLeads.push(callLead);
  } else {
    callLead.lastCompanyPhone = companyPhoneNumber;
  }

  return callLead;
}

// ── Simulated WhatsApp queue ─────────────────────────────────────────────────

function simulateQueueWhatsApp(
  db: InMemoryDb,
  callLead: SimCallLead,
  template: string | null,
) {
  // Check for existing active queue item (dedup)
  const existing = db.queueItems.find(
    (q) => q.phone === callLead.phone && (q.status === "QUEUED" || q.status === "SENDING"),
  );
  if (existing) {
    return { queued: false, reason: "already_active", queueItem: existing };
  }

  const formToken = generateRandomCode();
  const formLink = `https://crm.planle.com/atm-franchise/${formToken}`;
  const message = renderWhatsAppMessage(template, callLead.displayName, formLink);
  const delay = randomDelaySeconds(45, 120);

  const queueItem: SimWhatsAppQueueItem = {
    id: `qi-${randomBytes(4).toString("hex")}`,
    callLeadId: callLead.id,
    phone: callLead.phone,
    displayName: callLead.displayName,
    message,
    formToken,
    status: "QUEUED",
    sendAfterAt: new Date(Date.now() + delay * 1000),
  };
  db.queueItems.push(queueItem);

  return { queued: true, reason: "created", queueItem };
}

// ── Simulated form submission ────────────────────────────────────────────────

function simulateFormSubmission(
  db: InMemoryDb,
  token: string,
  formData: { name: string; city: string; propertyType: string; mapsLocation: string },
) {
  const queueItem = db.findQueueItemByFormToken(token);
  if (!queueItem) return { ok: false, error: "Invalid form token" };

  const callLead = db.callLeads.find((l) => l.id === queueItem.callLeadId);
  if (!callLead) return { ok: false, error: "Lead not found" };

  const submission: SimFormSubmission = {
    id: `sub-${randomBytes(4).toString("hex")}`,
    formToken: token,
    callLeadId: callLead.id,
    phone: queueItem.phone,
    name: formData.name,
    city: formData.city,
    propertyType: formData.propertyType,
    mapsLocation: formData.mapsLocation,
    status: "FORM_SUBMITTED",
  };
  db.formSubmissions.push(submission);

  // Update call lead with form data (mirrors real submitFormAction)
  callLead.displayName = formData.name;

  return { ok: true, submission, callLeadId: callLead.id };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("Multi-Phone WhatsApp Form Link Routing", () => {
  it("routes form submissions to the correct CallLead for each company phone", () => {
    const db = new InMemoryDb();
    const companyPhoneA = "+919000000001"; // Phone A
    const companyPhoneB = "+919000000002"; // Phone B

    // Customer X calls Phone A
    const customerXPhone = "9876501234";
    const leadX = simulateIncomingCall(db, customerXPhone, "Customer X", companyPhoneA);

    // Customer Y calls Phone B
    const customerYPhone = "9876505678";
    const leadY = simulateIncomingCall(db, customerYPhone, "Customer Y", companyPhoneB);

    // Verify two separate leads were created
    expect(db.callLeads).toHaveLength(2);
    expect(leadX.phone).toBe("+919876501234");
    expect(leadY.phone).toBe("+919876505678");
    expect(leadX.firstCompanyPhone).toBe(companyPhoneA);
    expect(leadY.firstCompanyPhone).toBe(companyPhoneB);

    // Queue WhatsApp for both
    const queueResultX = simulateQueueWhatsApp(db, leadX, null);
    const queueResultY = simulateQueueWhatsApp(db, leadY, null);

    expect(queueResultX.queued).toBe(true);
    expect(queueResultY.queued).toBe(true);
    expect(db.queueItems).toHaveLength(2);

    // Each queue item has a unique form token
    const tokenX = queueResultX.queueItem.formToken;
    const tokenY = queueResultY.queueItem.formToken;
    expect(tokenX).not.toBe(tokenY);

    // Messages contain the correct form links
    expect(queueResultX.queueItem.message).toContain(tokenX);
    expect(queueResultY.queueItem.message).toContain(tokenY);
    expect(queueResultX.queueItem.message).toContain("Customer X");
    expect(queueResultY.queueItem.message).toContain("Customer Y");

    // Customer X submits their form
    const submissionX = simulateFormSubmission(db, tokenX, {
      name: "Ramesh Kumar",
      city: "Chennai",
      propertyType: "OWN",
      mapsLocation: "https://maps.google.com/maps?q=Chennai",
    });

    // Customer Y submits their form
    const submissionY = simulateFormSubmission(db, tokenY, {
      name: "Suresh Singh",
      city: "Mumbai",
      propertyType: "RENTAL",
      mapsLocation: "https://maps.google.com/maps?q=Mumbai",
    });

    // Verify both submissions succeeded
    expect(submissionX.ok).toBe(true);
    expect(submissionY.ok).toBe(true);

    // Verify submissions went to correct CallLeads (NO cross-contamination)
    expect(submissionX.callLeadId).toBe(leadX.id);
    expect(submissionY.callLeadId).toBe(leadY.id);

    // Verify the form data is on the correct lead
    const updatedLeadX = db.callLeads.find((l) => l.id === leadX.id)!;
    const updatedLeadY = db.callLeads.find((l) => l.id === leadY.id)!;
    expect(updatedLeadX.displayName).toBe("Ramesh Kumar");
    expect(updatedLeadY.displayName).toBe("Suresh Singh");

    // Verify form submissions are linked to correct phones
    const subX = db.findFormSubmissionByToken(tokenX)!;
    const subY = db.findFormSubmissionByToken(tokenY)!;
    expect(subX.phone).toBe("+919876501234");
    expect(subY.phone).toBe("+919876505678");
    expect(subX.city).toBe("Chennai");
    expect(subY.city).toBe("Mumbai");
  });

  it("prevents duplicate WhatsApp queueing for the same caller", () => {
    const db = new InMemoryDb();
    const companyPhoneA = "+919000000001";
    const companyPhoneB = "+919000000002";

    // Same customer calls both phones
    const customerPhone = "9876512345";
    const leadFromA = simulateIncomingCall(db, customerPhone, "Customer Z", companyPhoneA);
    const leadFromB = simulateIncomingCall(db, customerPhone, "Customer Z", companyPhoneB);

    // Same lead (matched by phone)
    expect(leadFromA.id).toBe(leadFromB.id);
    expect(db.callLeads).toHaveLength(1);

    // Queue WhatsApp from first call
    const firstQueue = simulateQueueWhatsApp(db, leadFromA, null);
    expect(firstQueue.queued).toBe(true);

    // Second attempt should be deduplicated
    const secondQueue = simulateQueueWhatsApp(db, leadFromB, null);
    expect(secondQueue.queued).toBe(false);
    expect(secondQueue.reason).toBe("already_active");

    // Only one queue item exists
    expect(db.queueItems).toHaveLength(1);
  });

  it("form token from one customer cannot access another customer's data", () => {
    const db = new InMemoryDb();

    const leadA = simulateIncomingCall(db, "9876500001", "Lead A", "+919000000001");
    const leadB = simulateIncomingCall(db, "9876500002", "Lead B", "+919000000002");

    const queueA = simulateQueueWhatsApp(db, leadA, null);
    simulateQueueWhatsApp(db, leadB, null);

    // Try to submit form data using Lead A's token but it should save to Lead A, not B
    const result = simulateFormSubmission(db, queueA.queueItem.formToken, {
      name: "Test Name",
      city: "Delhi",
      propertyType: "OWN",
      mapsLocation: "https://maps.google.com/maps?q=Delhi",
    });

    expect(result.ok).toBe(true);
    expect(result.callLeadId).toBe(leadA.id);
    expect(result.callLeadId).not.toBe(leadB.id);
  });

  it("returns error for invalid form token", () => {
    const db = new InMemoryDb();

    const result = simulateFormSubmission(db, "nonexistent-token", {
      name: "Test",
      city: "Test",
      propertyType: "OWN",
      mapsLocation: "https://maps.google.com/maps?q=Test",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Invalid");
  });

  it("handles rapid consecutive calls from different customers on same phone", () => {
    const db = new InMemoryDb();
    const companyPhone = "+919000000001";

    // Three different customers call the same company phone rapidly
    const customers = [
      { phone: "9876510001", name: "Customer 1" },
      { phone: "9876510002", name: "Customer 2" },
      { phone: "9876510003", name: "Customer 3" },
    ];

    const leads = customers.map((c) =>
      simulateIncomingCall(db, c.phone, c.name, companyPhone),
    );

    // All three get unique leads
    expect(db.callLeads).toHaveLength(3);

    // All three get queued
    const queueResults = leads.map((l) => simulateQueueWhatsApp(db, l, null));
    expect(queueResults.every((r) => r.queued)).toBe(true);
    expect(db.queueItems).toHaveLength(3);

    // All tokens are unique
    const tokens = queueResults.map((r) => r.queueItem.formToken);
    expect(new Set(tokens).size).toBe(3);

    // Each submission routes to the correct lead
    for (let i = 0; i < 3; i++) {
      const result = simulateFormSubmission(db, tokens[i], {
        name: `Updated ${customers[i].name}`,
        city: `City ${i}`,
        propertyType: "OWN",
        mapsLocation: `https://maps.google.com/maps?q=City${i}`,
      });
      expect(result.ok).toBe(true);
      expect(result.callLeadId).toBe(leads[i].id);
    }
  });
});
