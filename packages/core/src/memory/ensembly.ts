import { createHash } from "node:crypto";
import {
  EnsemblyKindSchema,
  EnsemblyRecordSchema,
  type EnsemblyKind,
  type EnsemblyRecord,
} from "../state/schema.js";
import { canPromote } from "./promote.js";

export { canPromote };

export const pulsePackFormat = "ensembly-pulse-pack-v1";
export const legacyPulsePackFormat = "peram-pulse-pack-v1";

const trajectoryKind: Record<EnsemblyKind, "reflection" | "observation"> = {
  rule: "reflection",
  decision: "reflection",
  costly_mistake: "observation",
};

export type ArchiveEvent = {
  nat_key: string;
  ts: string;
  kind: string;
  payload: Record<string, unknown>;
};

export type MemoryTrace = {
  nat_key: string;
  ts: string;
  kind: string;
  content: Record<string, unknown>;
  coherence: number;
  agent_id: string;
  metadata: Record<string, unknown>;
  admitted_at: string;
};

export type PulsePack = {
  format: string;
  exported_at: string;
  source_host: string;
  pack_hash: string;
  memory_traces: MemoryTrace[];
  archive_events: ArchiveEvent[];
  memory_crdt: null;
};

export type IngestReport = {
  records: EnsemblyRecord[];
  added: number;
  skipped: number;
  conflicts: number;
};

function serdeFloat(value: number): string {
  if (!Number.isFinite(value)) throw new Error("Ensembly pack rejected a non-finite number.");
  const text = JSON.stringify(value);
  if (text.includes(".") || text.includes("e") || text.includes("E")) return text;
  return `${text}.0`;
}

function serdeValue(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return serdeFloat(value);
  if (Array.isArray(value)) return `[${value.map((item) => serdeValue(item)).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0,
    );
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${serdeValue(item)}`).join(",")}}`;
  }
  throw new Error("Ensembly pack rejected a non-JSON value.");
}

function timestampText(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Ensembly timestamp ${iso} is not ISO-8601.`);
  return parsed.toISOString().replace(/\.000Z$/, "Z");
}

function serdeTrace(trace: MemoryTrace): string {
  const fields: Array<[string, string]> = [
    ["nat_key", JSON.stringify(trace.nat_key)],
    ["ts", JSON.stringify(timestampText(trace.ts))],
    ["kind", JSON.stringify(trace.kind)],
    ["content", serdeValue(trace.content)],
    ["coherence", serdeFloat(trace.coherence)],
    ["agent_id", JSON.stringify(trace.agent_id)],
    ["metadata", serdeValue(trace.metadata)],
    ["admitted_at", JSON.stringify(timestampText(trace.admitted_at))],
  ];
  return `{${fields.map(([key, value]) => `${JSON.stringify(key)}:${value}`).join(",")}}`;
}

function serdeArchive(event: ArchiveEvent): string {
  const fields: Array<[string, string]> = [
    ["nat_key", JSON.stringify(event.nat_key)],
    ["ts", JSON.stringify(timestampText(event.ts))],
    ["kind", JSON.stringify(event.kind)],
    ["payload", serdeValue(event.payload)],
  ];
  return `{${fields.map(([key, value]) => `${JSON.stringify(key)}:${value}`).join(",")}}`;
}

export function canonicalPackMaterial(
  traces: readonly MemoryTrace[],
  archive: readonly ArchiveEvent[],
  memoryHash: string | null,
): string {
  const hash = memoryHash === null ? "null" : JSON.stringify(memoryHash);
  return `{"archive":[${archive.map((event) => serdeArchive(event)).join(",")}],"memory_hash":${hash},"traces":[${traces.map((trace) => serdeTrace(trace)).join(",")}]}`;
}

export function packHash(
  traces: readonly MemoryTrace[],
  archive: readonly ArchiveEvent[],
  memoryHash: string | null,
): string {
  return createHash("sha256")
    .update(canonicalPackMaterial(traces, archive, memoryHash))
    .digest("hex");
}

export function recordPayload(record: EnsemblyRecord): Record<string, unknown> {
  return {
    id: record.id,
    timestamp: record.timestamp,
    kind: record.kind,
    summary: record.summary,
    rationale: record.rationale,
    provenance: record.provenance,
    confirmedOutcome: record.confirmedOutcome,
  };
}

function recordFromPayload(kind: string, payload: Record<string, unknown>, fallbackId: string, fallbackTs: string): EnsemblyRecord | null {
  const parsedKind = EnsemblyKindSchema.safeParse(payload.kind ?? kind);
  if (!parsedKind.success) return null;
  const parsed = EnsemblyRecordSchema.safeParse({
    id: payload.id ?? fallbackId,
    timestamp: payload.timestamp ?? fallbackTs,
    kind: parsedKind.data,
    summary: payload.summary,
    rationale: payload.rationale,
    provenance: payload.provenance,
    confirmedOutcome: payload.confirmedOutcome ?? null,
  });
  return parsed.success ? parsed.data : null;
}

export function recordsToJsonl(records: readonly EnsemblyRecord[]): string {
  if (records.length === 0) return "";
  return `${records.map((record) => JSON.stringify(EnsemblyRecordSchema.parse(record))).join("\n")}\n`;
}

export function recordsFromJsonl(text: string): { records: EnsemblyRecord[]; skipped: number } {
  const records: EnsemblyRecord[] = [];
  let skipped = 0;
  for (const line of text.split("\n")) {
    if (line.trim() === "") continue;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      skipped += 1;
      continue;
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      skipped += 1;
      continue;
    }
    const row = value as Record<string, unknown>;
    if ("nat_key" in row && "payload" in row && row.payload && typeof row.payload === "object") {
      const payload = row.payload as Record<string, unknown>;
      const record = recordFromPayload(
        typeof row.kind === "string" ? row.kind : "",
        payload,
        typeof row.nat_key === "string" ? row.nat_key : "",
        typeof row.ts === "string" ? row.ts : "",
      );
      if (!record) {
        skipped += 1;
        continue;
      }
      records.push(record);
      continue;
    }
    const direct = EnsemblyRecordSchema.safeParse(row);
    if (!direct.success) {
      skipped += 1;
      continue;
    }
    records.push(direct.data);
  }
  return { records, skipped };
}

export function archiveEventFromRecord(record: EnsemblyRecord): ArchiveEvent {
  return {
    nat_key: record.id,
    ts: record.timestamp,
    kind: record.kind,
    payload: recordPayload(record),
  };
}

export function traceFromRecord(record: EnsemblyRecord): MemoryTrace {
  return {
    nat_key: record.id,
    ts: record.timestamp,
    kind: trajectoryKind[record.kind],
    content: recordPayload(record),
    coherence: 1,
    agent_id: "visualizer",
    metadata: {},
    admitted_at: record.timestamp,
  };
}

export function exportPulsePack(
  records: readonly EnsemblyRecord[],
  options: { exportedAt: string; sourceHost?: string },
): PulsePack {
  const archive = records.map((record) => archiveEventFromRecord(record));
  const traces = records.filter((record) => canPromote(record)).map((record) => traceFromRecord(record));
  return {
    format: pulsePackFormat,
    exported_at: options.exportedAt,
    source_host: options.sourceHost ?? "visualizer",
    pack_hash: packHash(traces, archive, null),
    memory_traces: traces,
    archive_events: archive,
    memory_crdt: null,
  };
}

function isKnownFormat(format: string): boolean {
  return format === pulsePackFormat || format === legacyPulsePackFormat;
}

export function readPulsePack(raw: unknown): PulsePack {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Ensembly pulse pack is not an object.");
  }
  const pack = raw as Record<string, unknown>;
  if (typeof pack.format !== "string" || !isKnownFormat(pack.format)) {
    throw new Error("Ensembly pulse pack format is not recognized.");
  }
  const traces = Array.isArray(pack.memory_traces) ? pack.memory_traces : null;
  const archive = Array.isArray(pack.archive_events) ? pack.archive_events : [];
  if (!traces || typeof pack.pack_hash !== "string") {
    throw new Error("Ensembly pulse pack is missing traces or pack_hash.");
  }
  const memoryHash = typeof pack.memory_hash === "string" ? pack.memory_hash : null;
  const parsedTraces = traces.map((trace) => parseTrace(trace));
  const parsedArchive = archive.map((event) => parseArchive(event));
  const expected = packHash(parsedTraces, parsedArchive, memoryHash);
  if (expected !== pack.pack_hash) {
    throw new Error("Ensembly pulse pack hash does not match its traces and archive.");
  }
  return {
    format: pack.format,
    exported_at: typeof pack.exported_at === "string" ? pack.exported_at : "",
    source_host: typeof pack.source_host === "string" ? pack.source_host : "visualizer",
    pack_hash: pack.pack_hash,
    memory_traces: parsedTraces,
    archive_events: parsedArchive,
    memory_crdt: null,
  };
}

function parseTrace(raw: unknown): MemoryTrace {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Ensembly trace is not an object.");
  const trace = raw as Record<string, unknown>;
  if (typeof trace.nat_key !== "string" || typeof trace.ts !== "string" || typeof trace.kind !== "string") {
    throw new Error("Ensembly trace is missing nat_key, ts, or kind.");
  }
  if (!trace.content || typeof trace.content !== "object" || Array.isArray(trace.content)) {
    throw new Error("Ensembly trace content is not an object.");
  }
  if (typeof trace.coherence !== "number" || typeof trace.agent_id !== "string" || typeof trace.admitted_at !== "string") {
    throw new Error("Ensembly trace is missing coherence, agent_id, or admitted_at.");
  }
  const metadata =
    trace.metadata && typeof trace.metadata === "object" && !Array.isArray(trace.metadata)
      ? (trace.metadata as Record<string, unknown>)
      : {};
  return {
    nat_key: trace.nat_key,
    ts: trace.ts,
    kind: trace.kind,
    content: trace.content as Record<string, unknown>,
    coherence: trace.coherence,
    agent_id: trace.agent_id,
    metadata,
    admitted_at: trace.admitted_at,
  };
}

function parseArchive(raw: unknown): ArchiveEvent {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Ensembly archive event is not an object.");
  const event = raw as Record<string, unknown>;
  if (typeof event.nat_key !== "string" || typeof event.ts !== "string" || typeof event.kind !== "string") {
    throw new Error("Ensembly archive event is missing nat_key, ts, or kind.");
  }
  if (!event.payload || typeof event.payload !== "object" || Array.isArray(event.payload)) {
    throw new Error("Ensembly archive payload is not an object.");
  }
  return {
    nat_key: event.nat_key,
    ts: event.ts,
    kind: event.kind,
    payload: event.payload as Record<string, unknown>,
  };
}

export function recordsFromPack(pack: PulsePack): EnsemblyRecord[] {
  const records: EnsemblyRecord[] = [];
  for (const event of pack.archive_events) {
    const record = recordFromPayload(event.kind, event.payload, event.nat_key, event.ts);
    if (record) records.push(record);
  }
  if (records.length > 0) return records;
  for (const trace of pack.memory_traces) {
    const record = recordFromPayload(trace.kind, trace.content, trace.nat_key, trace.ts);
    if (record) records.push(record);
  }
  return records;
}

function sameRecord(left: EnsemblyRecord, right: EnsemblyRecord): boolean {
  return JSON.stringify(recordPayload(left)) === JSON.stringify(recordPayload(right));
}

export function mergeLedger(existing: readonly EnsemblyRecord[], incoming: readonly EnsemblyRecord[]): IngestReport {
  const records = [...existing];
  let added = 0;
  let skipped = 0;
  let conflicts = 0;
  for (const record of incoming) {
    const prior = records.find((item) => item.id === record.id);
    if (!prior) {
      records.push(record);
      added += 1;
      continue;
    }
    if (sameRecord(prior, record)) skipped += 1;
    else conflicts += 1;
  }
  return { records, added, skipped, conflicts };
}
