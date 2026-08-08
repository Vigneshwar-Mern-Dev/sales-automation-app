export type DeferredAccountCandidate = {
  id: string;
  lastAssignedAt: Date | null;
  createdAt: Date;
};

/** Connected accounts can send now; every other state keeps the item queued. */
export function isDeferredWhatsAppStatus(status: string) {
  return status !== "CONNECTED";
}

/**
 * Preserve an existing sticky sender when possible. Otherwise choose the
 * least-recently assigned account, with creation time as a stable tiebreaker.
 */
export function chooseDeferredWhatsAppAccount<T extends DeferredAccountCandidate>(
  accounts: T[],
  preferredAccountId?: string | null,
): T | null {
  if (accounts.length === 0) return null;

  const preferred = accounts.find((account) => account.id === preferredAccountId);
  if (preferred) return preferred;

  return [...accounts].sort((left, right) => {
    const assignedDifference =
      (left.lastAssignedAt?.getTime() ?? 0) -
      (right.lastAssignedAt?.getTime() ?? 0);
    if (assignedDifference !== 0) return assignedDifference;
    return left.createdAt.getTime() - right.createdAt.getTime();
  })[0];
}
