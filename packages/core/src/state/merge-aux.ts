import type { EnsemblyRecord, FleetProposal, LogEntry, PulseMemory, WorkspaceState } from "./schema.js";

function logKey(entry: LogEntry): string {
  return `${entry.id}\u0000${entry.kind}\u0000${entry.message}`;
}

function logNumber(id: string): number {
  const match = /^log-(\d+)$/.exec(id);
  return match ? Number(match[1]) : 0;
}

function mergeById<T extends { id: string }>(tickRows: readonly T[], liveRows: readonly T[]): T[] {
  const ids = new Set(tickRows.map((row) => row.id));
  return [...tickRows, ...liveRows.filter((row) => !ids.has(row.id))];
}

export function mergeAuxIntoTick(live: WorkspaceState, tick: WorkspaceState): WorkspaceState {
  const lessonIds = new Set(tick.workflowLessons.map((lesson) => lesson.id));
  const workflowLessons = [
    ...tick.workflowLessons,
    ...live.workflowLessons.filter((lesson) => !lessonIds.has(lesson.id)),
  ];
  const tickKeys = new Set(tick.eventLog.map(logKey));
  const used = new Set(tick.eventLog.map((entry) => entry.id));
  let logSeq = Math.max(tick.logSeq, live.logSeq);
  const appended: LogEntry[] = [];
  for (const entry of live.eventLog) {
    if (tickKeys.has(logKey(entry))) continue;
    let next = entry;
    if (used.has(entry.id)) {
      logSeq += 1;
      while (used.has(`log-${logSeq}`)) logSeq += 1;
      next = { ...entry, id: `log-${logSeq}` };
    }
    used.add(next.id);
    logSeq = Math.max(logSeq, logNumber(next.id));
    appended.push(next);
  }
  const ensemblyLedger: EnsemblyRecord[] = mergeById(tick.ensemblyLedger, live.ensemblyLedger);
  const pulseMemory: PulseMemory[] = mergeById(tick.pulseMemory, live.pulseMemory);
  const fleetProposals: FleetProposal[] = mergeById(tick.fleetProposals, live.fleetProposals);
  return {
    ...tick,
    ensemblyLedger,
    pulseMemory,
    fleetProposals,
    workflowLessons,
    eventLog: [...tick.eventLog, ...appended],
    logSeq,
  };
}
