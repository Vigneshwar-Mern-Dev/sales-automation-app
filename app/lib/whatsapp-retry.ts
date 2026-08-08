const ACTIVE_QUEUE_STATUSES = new Set(["QUEUED", "SENDING"]);
const NON_RETRYABLE_LEAD_STATUSES = new Set([
  "SENT",
  "QUEUED",
  "SENDING",
  "FORM_SUBMITTED",
  "DO_NOT_CONTACT",
  "CANCELLED",
]);

const NON_RETRYABLE_NUMBER_ERROR_PATTERNS = [
  "invalid_number",
  "invalid number",
  "invalid phone",
  "wid is invalid",
];

export type RetryEligibility = {
  retryable: boolean;
  reasons: string[];
};

export type RetryCandidate = {
  status: string;
  lastError: string | null;
  formSubmissions: Array<{ status: string }>;
  queueItems: Array<{ status: string; lastError: string | null }>;
};

export function isNonRetryableNumberFailure(error: string | null | undefined) {
  if (!error) {
    return false;
  }

  const normalized = error.toLowerCase();
  return NON_RETRYABLE_NUMBER_ERROR_PATTERNS.some((pattern) => normalized.includes(pattern));
}

export function evaluateWhatsAppRetry(candidate: RetryCandidate): RetryEligibility {
  const reasons: string[] = [];
  const latestQueueItem = candidate.queueItems[0] ?? null;
  const hasSubmittedForm = candidate.formSubmissions.some((submission) => submission.status === "FORM_SUBMITTED");
  const hasActiveQueueItem = candidate.queueItems.some((item) => ACTIVE_QUEUE_STATUSES.has(item.status));
  const hasFailedSendState = candidate.status === "FAILED" || latestQueueItem?.status === "FAILED";
  const hasNonRetryableNumberFailure =
    isNonRetryableNumberFailure(candidate.lastError) ||
    candidate.queueItems.some((item) => isNonRetryableNumberFailure(item.lastError));

  if (NON_RETRYABLE_LEAD_STATUSES.has(candidate.status)) {
    reasons.push(`Lead status is ${candidate.status}`);
  }

  if (!hasFailedSendState) {
    reasons.push("No failed WhatsApp send state");
  }

  if (hasSubmittedForm) {
    reasons.push("Form already submitted");
  }

  if (hasActiveQueueItem) {
    reasons.push("Active QUEUED/SENDING queue item exists");
  }

  if (hasNonRetryableNumberFailure) {
    reasons.push("Non-retryable WhatsApp number failure detected");
  }

  return {
    retryable: reasons.length === 0,
    reasons,
  };
}
