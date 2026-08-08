import type { WhatsAppConnectionStatus } from "@/app/lib/prisma-enums";

export function resolveBridgeStatus(
  currentStatus: WhatsAppConnectionStatus,
  incomingStatus: WhatsAppConnectionStatus | undefined,
  heartbeatOnly: boolean,
): WhatsAppConnectionStatus | undefined {
  if (heartbeatOnly || !incomingStatus) return undefined;

  // A running browser is transport health, not permission to dispatch. Keep a
  // manual/automatic pause until an admin explicitly resumes the account.
  if (
    currentStatus === "PAUSED" &&
    (incomingStatus === "CONNECTED" || incomingStatus === "CONNECTING")
  ) {
    return undefined;
  }

  return incomingStatus;
}
