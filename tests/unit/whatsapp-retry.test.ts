import { describe, expect, it } from "vitest";

import {
  evaluateWhatsAppRetry,
  isNonRetryableNumberFailure,
} from "../../app/lib/whatsapp-retry";

function failedCandidate(error: string) {
  return {
    status: "FAILED",
    lastError: error,
    formSubmissions: [],
    queueItems: [{ status: "FAILED", lastError: error }],
  };
}

describe("WhatsApp retry eligibility", () => {
  it("allows retry when WhatsApp Web reports a potentially stale registration result", () => {
    const result = evaluateWhatsAppRetry(
      failedCandidate("Phone number +916392641695 is not registered on WhatsApp."),
    );

    expect(result).toEqual({ retryable: true, reasons: [] });
  });

  it("blocks retry for a syntactically invalid phone number", () => {
    const result = evaluateWhatsAppRetry(failedCandidate("INVALID_NUMBER: invalid phone number"));

    expect(result.retryable).toBe(false);
    expect(result.reasons).toContain("Non-retryable WhatsApp number failure detected");
  });

  it("does not classify registration lookup wording as conclusive invalid syntax", () => {
    expect(isNonRetryableNumberFailure("Number not found on WhatsApp")).toBe(false);
    expect(isNonRetryableNumberFailure("Not registered on WhatsApp")).toBe(false);
  });

  it("does not retry when an inbound reply proves the customer is reachable", () => {
    const result = evaluateWhatsAppRetry({
      status: "REPLIED",
      lastError: null,
      formSubmissions: [],
      queueItems: [
        {
          status: "FAILED",
          lastError: "Phone number +917397702193 is not registered on WhatsApp.",
        },
      ],
    });

    expect(result.retryable).toBe(false);
    expect(result.reasons).toContain("Lead status is REPLIED");
  });

  it("does not retry a replied lead unless an outbound send actually failed", () => {
    const result = evaluateWhatsAppRetry({
      status: "REPLIED",
      lastError: null,
      formSubmissions: [],
      queueItems: [],
    });

    expect(result.retryable).toBe(false);
    expect(result.reasons).toContain("No failed WhatsApp send state");
  });

  it("does not retry a later failure when an earlier attempt was delivered", () => {
    const result = evaluateWhatsAppRetry({
      status: "FAILED",
      lastError: "Phone number is not registered on WhatsApp.",
      formSubmissions: [],
      queueItems: [
        { status: "FAILED", lastError: "Phone number is not registered on WhatsApp." },
        { status: "OPENED", lastError: null },
      ],
    });

    expect(result.retryable).toBe(false);
    expect(result.reasons).toContain("Message was already delivered");
  });
});
