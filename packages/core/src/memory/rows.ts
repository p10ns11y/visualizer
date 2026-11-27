import {
  EnsemblyKindSchema,
  LessonSignalSchema,
  PilotPhaseSchema,
  PulseMemorySchema,
  WorkflowLessonSchema,
  type PulseMemory,
  type WorkflowLesson,
} from "../state/schema.js";

export type CypherRow = {
  get(key: string): unknown;
};

function text(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

export function readPulseRow(row: CypherRow): PulseMemory {
  return PulseMemorySchema.parse({
    id: text(row.get("id")),
    timestamp: text(row.get("timestamp")),
    kind: EnsemblyKindSchema.parse(text(row.get("kind"))),
    summary: text(row.get("summary")),
    rationale: text(row.get("rationale")),
    provenance: text(row.get("provenance")),
    confirmedOutcome: text(row.get("confirmedOutcome")),
  });
}

export function readLessonRow(row: CypherRow): WorkflowLesson {
  return WorkflowLessonSchema.parse({
    id: text(row.get("id")),
    recordedAt: text(row.get("recordedAt")),
    phase: PilotPhaseSchema.parse(text(row.get("phase"))),
    cardId: text(row.get("cardId")),
    signal: LessonSignalSchema.parse(text(row.get("signal"))),
    lesson: text(row.get("lesson")),
    adjustment: text(row.get("adjustment")),
  });
}
