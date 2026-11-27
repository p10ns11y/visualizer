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
import { commitHuman, type CommitResult } from "../state/store.js";
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

function withMemoryLog(result: CommitResult, detail: string, before: WorkspaceState): CommitResult {
  if (!result.ok || result.state === before) return result;
  const paused =
    result.state.autopilot.phase === "paused_by_human" && before.autopilot.phase !== "paused_by_human";
  const message = paused ? `Human edit paused the run. ${detail}` : detail;
  const eventLog = result.state.eventLog.map((entry, index, all) =>
    index === all.length - 1 ? { ...entry, kind: "memory" as const, message } : entry,
  );
  return {
    ok: true,
    state: WorkspaceStateSchema.parse({ ...result.state, eventLog }),
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
  const result = commitHuman(state, expectedVersion, (draft) => ({
    ...draft,
    ensemblyLedger: [...draft.ensemblyLedger, record],
    pulseMemory: promoted ? [...draft.pulseMemory, PulseMemorySchema.parse(record)] : draft.pulseMemory,
  }));
  const detail = promoted
    ? `Promoted Ensembly record ${record.id} into Pulse Memory.`
    : `Appended Ensembly record ${record.id} without a confirmed outcome.`;
  return withMemoryLog(result, detail, state);
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
  const result = commitHuman(state, expectedVersion, (draft) => ({
    ...draft,
    pulseMemory: [...draft.pulseMemory, pulse],
  }));
  return withMemoryLog(result, `Promoted Ensembly record ${id} into Pulse Memory.`, state);
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
