import {
  CoherenceMilliSchema,
  EnsemblyKindSchema,
  LessonSignalSchema,
  PilotPhaseSchema,
  PulseMemorySchema,
  WorkflowLessonSchema,
  pulseLocks,
  pulseStatuses,
  pulseTraceKinds,
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

function optionalField(row: CypherRow, key: string): unknown {
  try {
    return row.get(key);
  } catch {
    return undefined;
  }
}

function optionalEnum<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  const parsed = text(value);
  if (parsed === null) return undefined;
  return allowed.includes(parsed as T) ? (parsed as T) : undefined;
}

function optionalHash(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  return text(value);
}

export function readPulseRow(row: CypherRow): PulseMemory {
  const coherence = optionalField(row, "coherenceMilli");
  const coherenceText = text(coherence);
  const coherenceValue =
    typeof coherence === "number" ? coherence : coherenceText === null ? undefined : Number(coherenceText);
  const coherenceMilli = CoherenceMilliSchema.safeParse(coherenceValue);
  const status = optionalEnum(optionalField(row, "status"), pulseStatuses);
  const traceKind = optionalEnum(optionalField(row, "traceKind"), pulseTraceKinds);
  const lock = optionalEnum(optionalField(row, "lock"), pulseLocks);
  return PulseMemorySchema.parse({
    id: text(row.get("id")),
    timestamp: text(row.get("timestamp")),
    kind: EnsemblyKindSchema.parse(text(row.get("kind"))),
    summary: text(row.get("summary")),
    rationale: text(row.get("rationale")),
    provenance: text(row.get("provenance")),
    confirmedOutcome: text(row.get("confirmedOutcome")),
    ...(status ? { status } : {}),
    ...(traceKind ? { traceKind } : {}),
    ...(lock ? { lock } : {}),
    verifyHash: optionalHash(optionalField(row, "verifyHash")),
    prefetchKey: optionalHash(optionalField(row, "prefetchKey")),
    supersededBy: optionalHash(optionalField(row, "supersededBy")),
    ...(coherenceMilli.success ? { coherenceMilli: coherenceMilli.data } : {}),
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
