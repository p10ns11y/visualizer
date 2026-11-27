import type {
  EnsemblyKind,
  EnsemblyRecord,
  PilotPhase,
  PulseMemory,
  WorkflowLesson,
  WorkspaceState,
} from "../state/schema.js";
import { verifyHashFor } from "./promote.js";

export type LessonFilter = {
  phase?: PilotPhase | null;
  cardId?: string | null;
};

export interface MemoryGraphStore {
  ensureSchema(): Promise<void>;
  upsertRecord(record: EnsemblyRecord): Promise<void>;
  promote(id: string, expectedVerifyHash?: string | null): Promise<PulseMemory | null>;
  recordLesson(lesson: WorkflowLesson): Promise<void>;
  listPulse(kind?: EnsemblyKind | null): Promise<PulseMemory[]>;
  listLessons(filter?: LessonFilter): Promise<WorkflowLesson[]>;
}

export async function projectWorkspace(
  store: MemoryGraphStore,
  state: WorkspaceState,
): Promise<void> {
  await store.ensureSchema();
  const promoted = new Set(state.pulseMemory.map((pulse) => pulse.id));
  for (const record of state.ensemblyLedger) {
    await store.upsertRecord(record);
    if (promoted.has(record.id)) {
      const expectedVerifyHash = record.status === "tool-verified" ? verifyHashFor(record.summary) : null;
      await store.promote(record.id, expectedVerifyHash);
    }
  }
  for (const lesson of state.workflowLessons) {
    await store.recordLesson(lesson);
  }
}
