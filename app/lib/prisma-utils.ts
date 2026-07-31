/**
 * Checks if an unknown error from Prisma has a specific error code.
 * Common codes: P1001 (connection refused), P2002 (unique constraint),
 * P2034 (serialization failure).
 */
export function hasPrismaCode(error: unknown, code: string) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === code
  );
}
