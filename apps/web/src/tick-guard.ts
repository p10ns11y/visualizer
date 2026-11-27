export function pendingTickStillApplies(
  runToken: number,
  capturedToken: number,
  liveVersion: number,
  startedVersion: number,
): boolean {
  return runToken === capturedToken && liveVersion === startedVersion;
}
