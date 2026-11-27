import type {
  EnsemblyKind,
  EnsemblyRecord,
  PilotPhase,
  WorkflowLesson,
} from "../state/schema.js";

export type BoundQuery = {
  readonly text: string;
  readonly params: Record<string, string | null>;
};

export const schemaStatements = [
  `CREATE CONSTRAINT visualizer_ensembly_record_id IF NOT EXISTS
FOR (record:VisualizerEnsemblyRecord) REQUIRE record.id IS UNIQUE`,
  `CREATE CONSTRAINT visualizer_pulse_memory_id IF NOT EXISTS
FOR (pulse:VisualizerPulseMemory) REQUIRE pulse.id IS UNIQUE`,
  `CREATE CONSTRAINT visualizer_workflow_lesson_id IF NOT EXISTS
FOR (lesson:VisualizerWorkflowLesson) REQUIRE lesson.id IS UNIQUE`,
  `CREATE CONSTRAINT visualizer_phase_name IF NOT EXISTS
FOR (phase:VisualizerPhase) REQUIRE phase.name IS UNIQUE`,
  `CREATE CONSTRAINT visualizer_card_id IF NOT EXISTS
FOR (card:VisualizerCard) REQUIRE card.id IS UNIQUE`,
] as const;

export const schemaScript = `${schemaStatements.join(";\n")};\n`;

export function mergeEnsemblyRecord(record: EnsemblyRecord): BoundQuery {
  return {
    text: `MERGE (record:VisualizerEnsemblyRecord {id: $id})
ON CREATE SET
  record.timestamp = $timestamp,
  record.kind = $kind,
  record.summary = $summary,
  record.rationale = $rationale,
  record.provenance = $provenance,
  record.confirmedOutcome = $confirmedOutcome`,
    params: {
      id: record.id,
      timestamp: record.timestamp,
      kind: record.kind,
      summary: record.summary,
      rationale: record.rationale,
      provenance: record.provenance,
      confirmedOutcome: record.confirmedOutcome,
    },
  };
}

export function promotePulse(id: string): BoundQuery {
  return {
    text: `MATCH (record:VisualizerEnsemblyRecord {id: $id})
WHERE record.confirmedOutcome IS NOT NULL AND record.confirmedOutcome <> ""
MERGE (pulse:VisualizerPulseMemory {id: record.id})
ON CREATE SET
  pulse.timestamp = record.timestamp,
  pulse.kind = record.kind,
  pulse.summary = record.summary,
  pulse.rationale = record.rationale,
  pulse.provenance = record.provenance,
  pulse.confirmedOutcome = record.confirmedOutcome
MERGE (pulse)-[:PROMOTED_FROM]->(record)
RETURN pulse.id AS id, pulse.timestamp AS timestamp, pulse.kind AS kind,
  pulse.summary AS summary, pulse.rationale AS rationale,
  pulse.provenance AS provenance, pulse.confirmedOutcome AS confirmedOutcome`,
    params: { id },
  };
}

export function mergeWorkflowLesson(lesson: WorkflowLesson): BoundQuery[] {
  const lessonQuery: BoundQuery = {
    text: `MERGE (phase:VisualizerPhase {name: $phase})
MERGE (lesson:VisualizerWorkflowLesson {id: $id})
ON CREATE SET
  lesson.recordedAt = $recordedAt,
  lesson.signal = $signal,
  lesson.lesson = $lesson,
  lesson.adjustment = $adjustment
MERGE (lesson)-[:DURING]->(phase)`,
    params: {
      id: lesson.id,
      recordedAt: lesson.recordedAt,
      phase: lesson.phase,
      signal: lesson.signal,
      lesson: lesson.lesson,
      adjustment: lesson.adjustment,
    },
  };
  if (!lesson.cardId) return [lessonQuery];
  return [
    lessonQuery,
    {
      text: `MATCH (lesson:VisualizerWorkflowLesson {id: $id})
MERGE (card:VisualizerCard {id: $cardId})
MERGE (lesson)-[:ABOUT]->(card)`,
      params: { id: lesson.id, cardId: lesson.cardId },
    },
  ];
}

export function listPulseQuery(kind: EnsemblyKind | null): BoundQuery {
  return {
    text: `MATCH (pulse:VisualizerPulseMemory)
WHERE $kind IS NULL OR pulse.kind = $kind
RETURN pulse.id AS id, pulse.timestamp AS timestamp, pulse.kind AS kind,
  pulse.summary AS summary, pulse.rationale AS rationale,
  pulse.provenance AS provenance, pulse.confirmedOutcome AS confirmedOutcome
ORDER BY pulse.timestamp, pulse.id`,
    params: { kind },
  };
}

export function listLessonsQuery(filter: {
  phase: PilotPhase | null;
  cardId: string | null;
}): BoundQuery {
  return {
    text: `MATCH (lesson:VisualizerWorkflowLesson)-[:DURING]->(phase:VisualizerPhase)
OPTIONAL MATCH (lesson)-[:ABOUT]->(card:VisualizerCard)
WHERE ($phase IS NULL OR phase.name = $phase)
  AND ($cardId IS NULL OR card.id = $cardId)
RETURN lesson.id AS id, lesson.recordedAt AS recordedAt, phase.name AS phase,
  card.id AS cardId, lesson.signal AS signal, lesson.lesson AS lesson,
  lesson.adjustment AS adjustment
ORDER BY lesson.recordedAt, lesson.id`,
    params: { phase: filter.phase, cardId: filter.cardId },
  };
}
