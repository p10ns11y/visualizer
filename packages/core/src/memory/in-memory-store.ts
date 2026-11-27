import {
  PulseMemorySchema,
  type EnsemblyKind,
  type EnsemblyRecord,
  type PulseMemory,
  type WorkflowLesson,
} from "../state/schema.js";
import type { LessonFilter, MemoryGraphStore } from "./port.js";

function byTimestampThenId<T extends { id: string }>(
  rows: readonly T[],
  timestamp: (row: T) => string,
): T[] {
  return [...rows].sort((left, right) => {
    const time = timestamp(left).localeCompare(timestamp(right));
    if (time !== 0) return time;
    return left.id.localeCompare(right.id);
  });
}

export class InMemoryGraphMemoryStore implements MemoryGraphStore {
  private readonly records = new Map<string, EnsemblyRecord>();
  private readonly pulse = new Map<string, PulseMemory>();
  private readonly lessons = new Map<string, WorkflowLesson>();
  private schemaReady = false;

  async ensureSchema(): Promise<void> {
    this.schemaReady = true;
  }

  schemaApplied(): boolean {
    return this.schemaReady;
  }

  async upsertRecord(record: EnsemblyRecord): Promise<void> {
    if (!this.records.has(record.id)) this.records.set(record.id, record);
  }

  async promote(id: string): Promise<PulseMemory | null> {
    const existing = this.pulse.get(id);
    if (existing) return existing;
    const record = this.records.get(id);
    if (!record?.confirmedOutcome) return null;
    const pulse = PulseMemorySchema.parse(record);
    this.pulse.set(id, pulse);
    return pulse;
  }

  async recordLesson(lesson: WorkflowLesson): Promise<void> {
    if (!this.lessons.has(lesson.id)) this.lessons.set(lesson.id, lesson);
  }

  async listPulse(kind?: EnsemblyKind | null): Promise<PulseMemory[]> {
    const rows = [...this.pulse.values()].filter((pulse) => kind == null || pulse.kind === kind);
    return byTimestampThenId(rows, (pulse) => pulse.timestamp);
  }

  async listLessons(filter?: LessonFilter): Promise<WorkflowLesson[]> {
    const phase = filter?.phase ?? null;
    const cardId = filter?.cardId ?? null;
    const rows = [...this.lessons.values()].filter((lesson) => {
      if (phase != null && lesson.phase !== phase) return false;
      if (cardId != null && lesson.cardId !== cardId) return false;
      return true;
    });
    return byTimestampThenId(rows, (lesson) => lesson.recordedAt);
  }
}
