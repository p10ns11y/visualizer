import {
  EnsemblyRecordSchema,
  PulseMemorySchema,
  WorkflowLessonSchema,
  WorkspaceStateSchema,
  type EnsemblyRecord,
  type LessonSignal,
  type PilotPhase,
  type WorkspaceState,
} from "../state/schema.js";
import type { CommitResult } from "../state/store.js";
import { mergeLedger } from "./ensembly.js";
import { canPromote, verifyHashFor } from "./promote.js";

function sameOrConflict(state: WorkspaceState, expectedVersion: number): CommitResult {
  if (expectedVersion !== state.stateVersion) {
    return {
      ok: false,
      error: {
        code: "STATE_CONFLICT",
        expectedVersion,
        actualVersion: state.stateVersion,
      },
    };
  }
  return { ok: true, state };
}

function commitAux(
  state: WorkspaceState,
  expectedVersion: number,
  mutate: (draft: WorkspaceState) => WorkspaceState,
  message: string,
): CommitResult {
  if (expectedVersion !== state.stateVersion) return sameOrConflict(state, expectedVersion);
  const edited = mutate(structuredClone(state));
  const logSeq = state.logSeq + 1;
  return {
    ok: true,
    state: WorkspaceStateSchema.parse({
      ...edited,
      stateVersion: state.stateVersion,
      autopilot: state.autopilot,
      logSeq,
      eventLog: [
        ...state.eventLog,
        {
          id: `log-${logSeq}`,
          stateVersion: state.stateVersion,
          kind: "memory",
          message,
        },
      ],
    }),
  };
}

export function appendEnsemblyRecord(
  state: WorkspaceState,
  expectedVersion: number,
  input: EnsemblyRecord,
): CommitResult {
  const parsed = EnsemblyRecordSchema.parse(input);
  const record =
    parsed.status === "tool-verified" && !parsed.verifyHash
      ? EnsemblyRecordSchema.parse({ ...parsed, verifyHash: verifyHashFor(parsed.summary) })
      : parsed;
  const existing = state.ensemblyLedger.find((item) => item.id === record.id);
  if (existing) return sameOrConflict(state, expectedVersion);
  const promoted = canPromote(record);
  const detail = promoted
    ? `Promoted Ensembly record ${record.id} into Pulse Memory.`
    : `Appended Ensembly record ${record.id} without a confirmed outcome.`;
  return commitAux(
    state,
    expectedVersion,
    (draft) => ({
      ...draft,
      ensemblyLedger: [...draft.ensemblyLedger, record],
      pulseMemory: promoted ? [...draft.pulseMemory, PulseMemorySchema.parse(record)] : draft.pulseMemory,
    }),
    detail,
  );
}

export function promoteEnsemblyRecord(
  state: WorkspaceState,
  expectedVersion: number,
  id: string,
): CommitResult {
  const record = state.ensemblyLedger.find((item) => item.id === id);
  if (!record || !canPromote(record) || state.pulseMemory.some((pulse) => pulse.id === id)) {
    return sameOrConflict(state, expectedVersion);
  }
  const pulse = PulseMemorySchema.parse(record);
  return commitAux(
    state,
    expectedVersion,
    (draft) => ({
      ...draft,
      pulseMemory: [...draft.pulseMemory, pulse],
    }),
    `Promoted Ensembly record ${id} into Pulse Memory.`,
  );
}

export function importEnsemblyRecords(
  state: WorkspaceState,
  expectedVersion: number,
  incoming: readonly EnsemblyRecord[],
): CommitResult & { added?: number; skipped?: number; conflicts?: number } {
  const report = mergeLedger(state.ensemblyLedger, incoming);
  if (report.added === 0) {
    const same = sameOrConflict(state, expectedVersion);
    return { ...same, added: report.added, skipped: report.skipped, conflicts: report.conflicts };
  }
  const known = new Set(state.pulseMemory.map((pulse) => pulse.id));
  const result = commitAux(
    state,
    expectedVersion,
    (draft) => {
      const pulseMemory = [...draft.pulseMemory];
      for (const record of report.records) {
        if (!canPromote(record) || known.has(record.id)) continue;
        pulseMemory.push(PulseMemorySchema.parse(record));
        known.add(record.id);
      }
      return { ...draft, ensemblyLedger: report.records, pulseMemory };
    },
    `Imported ${report.added} Ensembly records.`,
  );
  return { ...result, added: report.added, skipped: report.skipped, conflicts: report.conflicts };
}

export function recordWorkflowLesson(
  state: WorkspaceState,
  expectedVersion: number,
  input: {
    id: string;
    recordedAt: string;
    phase: PilotPhase;
    cardId: string | null;
    signal: LessonSignal;
    lesson: string;
    adjustment: string;
  },
): CommitResult {
  const lesson = WorkflowLessonSchema.parse(input);
  if (state.workflowLessons.some((item) => item.id === lesson.id)) {
    return sameOrConflict(state, expectedVersion);
  }
  if (lesson.cardId !== null && !state.problemCards.some((card) => card.id === lesson.cardId)) {
    return sameOrConflict(state, expectedVersion);
  }
  const card = lesson.cardId ?? "no card";
  return commitAux(
    state,
    expectedVersion,
    (draft) => ({
      ...draft,
      workflowLessons: [...draft.workflowLessons, lesson],
    }),
    `Recorded workflow lesson ${lesson.id} on ${lesson.phase} for ${card}.`,
  );
}
