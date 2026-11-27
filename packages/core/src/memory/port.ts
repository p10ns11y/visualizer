import type {
  EnsemblyKind,
  EnsemblyRecord,
  PilotPhase,
  PulseMemory,
  WorkflowLesson,
  WorkspaceState,
} from "../state/schema.js";

export type LessonFilter = {
  phase?: PilotPhase | null;
  cardId?: string | null;
};

export interface MemoryGraphStore {
  ensureSchema(): Promise<void>;
  upsertRecord(record: EnsemblyRecord): Promise<void>;
  promote(id: string): Promise<PulseMemory | null>;
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
    if (promoted.has(record.id)) await store.promote(record.id);
  }
  for (const lesson of state.workflowLessons) {
    await store.recordLesson(lesson);
  }
}
