export function shouldRestartStaleWorker(
  account,
  workerStartedAt,
  now = Date.now(),
  heartbeatStaleMs = 3 * 60 * 1000,
  startupGraceMs = 3 * 60 * 1000,
) {
  if (account?.status !== "CONNECTED") return false;
  if (now - workerStartedAt < startupGraceMs) return false;

  const heartbeatAt = account?.lastHeartbeatAt
    ? new Date(account.lastHeartbeatAt).getTime()
    : Number.NaN;
  return !Number.isFinite(heartbeatAt) || now - heartbeatAt > heartbeatStaleMs;
}
