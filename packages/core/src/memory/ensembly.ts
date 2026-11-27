import { createHash } from "node:crypto";
import { z } from "zod";
import {
  CoherenceMilliSchema,
  EnsemblyKindSchema,
  EnsemblyRecordSchema,
  PulseLockSchema,
  PulseStatusSchema,
  PulseTraceKindSchema,
  pulsePackSchema,
  type EnsemblyKind,
  type EnsemblyRecord,
  type PulseLock,
  type PulseStatus,
  type PulseTraceKind,
} from "../state/schema.js";
import { admittedKind, admittedStatus, canPromote } from "./promote.js";

export { canPromote };
export { pulsePackSchema };

export const pulsePackFormat = pulsePackSchema;
export const legacyEnsemblyPulsePackFormat = "ensembly-pulse-pack-v1";
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

export type LegacyPulsePack = {
  format: typeof legacyEnsemblyPulsePackFormat | typeof legacyPulsePackFormat;
  exported_at: string;
  source_host: string;
  pack_hash: string;
  memory_traces: MemoryTrace[];
  archive_events: ArchiveEvent[];
  memory_crdt: null;
};

export type CanonTrace = {
  nat_key: string;
  snippet: string;
  source: string;
  time: string;
  first_seen: string;
  last_seen: string;
  status: PulseStatus;
  kind: PulseTraceKind;
  lock: PulseLock;
  verify_hash: string | null;
  prefetch_key: string | null;
  superseded_by: string | null;
  seen_count: number;
  ext: {
    coherence_milli: number;
    content: Record<string, unknown>;
    kind: string;
  };
};

export type CanonArchiveEvent = {
  correlation_id: string;
  payload: string;
  source: string;
  ts: string;
  ext: { kind: string };
};

export type CanonPulsePack = {
  schema: typeof pulsePackSchema;
  format: typeof pulsePackSchema;
  exported_at: string;
  host: string;
  traces: CanonTrace[];
  archive: CanonArchiveEvent[];
  ext: { content_sha256: string };
};

export type PulsePack = CanonPulsePack | LegacyPulsePack;

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
  const payload: Record<string, unknown> = {
    id: record.id,
    timestamp: record.timestamp,
    kind: record.kind,
    summary: record.summary,
    rationale: record.rationale,
    provenance: record.provenance,
    confirmedOutcome: record.confirmedOutcome,
  };
  if (record.traceKind !== undefined) payload.traceKind = record.traceKind;
  if (record.status !== undefined) payload.status = record.status;
  if (record.lock !== undefined) payload.lock = record.lock;
  if (record.verifyHash !== undefined) payload.verifyHash = record.verifyHash;
  if (record.prefetchKey !== undefined) payload.prefetchKey = record.prefetchKey;
  if (record.supersededBy !== undefined) payload.supersededBy = record.supersededBy;
  if (record.coherenceMilli !== undefined) payload.coherenceMilli = record.coherenceMilli;
  return payload;
}

type AdmissionEnvelope = {
  traceKind?: unknown;
  status?: unknown;
  lock?: unknown;
  verifyHash?: unknown;
  prefetchKey?: unknown;
  supersededBy?: unknown;
  coherenceMilli?: unknown;
};

function admissionValue(payload: Record<string, unknown>, key: string, fallback: unknown): unknown {
  if (Object.prototype.hasOwnProperty.call(payload, key)) return payload[key];
  if (fallback === undefined || fallback === null) return undefined;
  return fallback;
}

function recordFromPayload(
  kind: string,
  payload: Record<string, unknown>,
  fallbackId: string,
  fallbackTs: string,
  envelope?: AdmissionEnvelope,
): EnsemblyRecord | null {
  const parsedKind = EnsemblyKindSchema.safeParse(payload.kind ?? kind);
  if (!parsedKind.success) return null;
  const candidate: Record<string, unknown> = {
    id: payload.id ?? fallbackId,
    timestamp: payload.timestamp ?? fallbackTs,
    kind: parsedKind.data,
    summary: payload.summary,
    rationale: payload.rationale,
    provenance: payload.provenance,
    confirmedOutcome: payload.confirmedOutcome ?? null,
  };
  const optional: Array<[string, unknown]> = [
    ["traceKind", admissionValue(payload, "traceKind", envelope?.traceKind)],
    ["status", admissionValue(payload, "status", envelope?.status)],
    ["lock", admissionValue(payload, "lock", envelope?.lock)],
    ["verifyHash", admissionValue(payload, "verifyHash", envelope?.verifyHash)],
    ["prefetchKey", admissionValue(payload, "prefetchKey", envelope?.prefetchKey)],
    ["supersededBy", admissionValue(payload, "supersededBy", envelope?.supersededBy)],
    ["coherenceMilli", admissionValue(payload, "coherenceMilli", envelope?.coherenceMilli)],
  ];
  for (const [key, value] of optional) {
    if (value !== undefined) candidate[key] = value;
  }
  const parsed = EnsemblyRecordSchema.safeParse(candidate);
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

function compareUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isInteger(value) || !Number.isSafeInteger(value)) {
      throw new Error("Ensembly pulse pack rejected a float.");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => compareUtf8(left, right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  throw new Error("Ensembly pulse pack rejected a non-JSON value.");
}

function sortTraces(traces: readonly CanonTrace[]): CanonTrace[] {
  return traces.slice().sort((left, right) => compareUtf8(left.nat_key, right.nat_key));
}

function sortArchive(archive: readonly CanonArchiveEvent[]): CanonArchiveEvent[] {
  return archive.slice().sort((left, right) => compareUtf8(canonicalJson(left), canonicalJson(right)));
}

export function canonContentMaterial(
  archive: readonly CanonArchiveEvent[],
  traces: readonly CanonTrace[],
): string {
  return `${canonicalJson({ archive, traces })}\n`;
}

export function contentSha256(
  archive: readonly CanonArchiveEvent[],
  traces: readonly CanonTrace[],
): string {
  return createHash("sha256").update(canonContentMaterial(archive, traces)).digest("hex");
}

const CanonTraceSchema = z
  .object({
    nat_key: z.string().min(1),
    snippet: z.string(),
    source: z.string(),
    time: z.string().min(1),
    first_seen: z.string().min(1),
    last_seen: z.string().min(1),
    status: PulseStatusSchema,
    kind: PulseTraceKindSchema,
    lock: PulseLockSchema,
    verify_hash: z.string().nullable(),
    prefetch_key: z.string().nullable(),
    superseded_by: z.string().nullable().optional(),
    seen_count: z.number().int().min(1),
    ext: z
      .object({
        coherence_milli: CoherenceMilliSchema,
        content: z.record(z.string(), z.unknown()),
        kind: z.string().min(1),
      })
      .strict(),
  })
  .strict();

const CanonPackSchema = z
  .object({
    schema: z.literal(pulsePackSchema).optional(),
    format: z.literal(pulsePackSchema).optional(),
    exported_at: z.string(),
    host: z.string(),
    traces: z.array(CanonTraceSchema),
    archive: z
      .array(
        z
          .object({
            correlation_id: z.string().min(1),
            payload: z.string(),
            source: z.string(),
            ts: z.string().min(1),
            ext: z.object({ kind: z.string().min(1) }).strict(),
          })
          .strict(),
      )
      .optional(),
    ext: z.object({ content_sha256: z.string() }).strict(),
  })
  .strict()
  .superRefine((pack, context) => {
    if (pack.format !== pulsePackSchema && pack.schema !== pulsePackSchema) {
      context.addIssue({ code: "custom", message: "Canon 1 pack schema is pulse-pack-v1.", path: ["schema"] });
    }
    if (pack.format && pack.schema && pack.format !== pack.schema) {
      context.addIssue({ code: "custom", message: "schema and format disagree.", path: ["schema"] });
    }
  });

function rejectFloatLiterals(text: string): void {
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    if (char === '"') {
      index += 1;
      while (index < text.length) {
        if (text[index] === "\\") {
          index += 2;
          continue;
        }
        if (text[index] === '"') {
          index += 1;
          break;
        }
        index += 1;
      }
      continue;
    }
    if (char === "-" || (char !== undefined && char >= "0" && char <= "9")) {
      const start = index;
      if (text[index] === "-") index += 1;
      while (index < text.length) {
        const digit = text[index];
        if (digit === undefined || digit < "0" || digit > "9") break;
        index += 1;
      }
      const token = text.slice(start, index);
      const next = text[index];
      if (next === "." || next === "e" || next === "E" || token === "-0") {
        throw new Error("Ensembly pulse pack rejected a float.");
      }
      continue;
    }
    index += 1;
  }
}

function floatIssue(error: z.ZodError): boolean {
  return error.issues.some((issue) => {
    const path = issue.path.join(".");
    return path.includes("coherence_milli") || path.includes("seen_count");
  });
}

function canonTrace(trace: z.infer<typeof CanonTraceSchema>): CanonTrace {
  return {
    nat_key: trace.nat_key,
    snippet: trace.snippet,
    source: trace.source,
    time: trace.time,
    first_seen: trace.first_seen,
    last_seen: trace.last_seen,
    status: trace.status,
    kind: trace.kind,
    lock: trace.lock,
    verify_hash: trace.verify_hash,
    prefetch_key: trace.prefetch_key,
    superseded_by: trace.superseded_by ?? null,
    seen_count: trace.seen_count,
    ext: {
      coherence_milli: trace.ext.coherence_milli,
      content: trace.ext.content,
      kind: trace.ext.kind,
    },
  };
}

function canonArchive(event: {
  correlation_id: string;
  payload: string;
  source: string;
  ts: string;
  ext: { kind: string };
}): CanonArchiveEvent {
  return {
    correlation_id: event.correlation_id,
    payload: event.payload,
    source: event.source,
    ts: event.ts,
    ext: { kind: event.ext.kind },
  };
}

function canonTraceFromRecord(record: EnsemblyRecord): CanonTrace {
  const time = timestampText(record.timestamp);
  return {
    nat_key: record.id,
    snippet: record.summary,
    source: record.provenance,
    time,
    first_seen: time,
    last_seen: time,
    status: admittedStatus(record),
    kind: admittedKind(record),
    lock: record.lock ?? "open",
    verify_hash: record.verifyHash ?? null,
    prefetch_key: record.prefetchKey ?? null,
    superseded_by: record.supersededBy ?? null,
    seen_count: 1,
    ext: {
      coherence_milli: record.coherenceMilli ?? 1000,
      content: recordPayload(record),
      kind: record.kind,
    },
  };
}

function canonArchiveFromRecord(record: EnsemblyRecord): CanonArchiveEvent {
  return {
    correlation_id: record.id,
    payload: canonicalJson(recordPayload(record)),
    source: "ensembly",
    ts: timestampText(record.timestamp),
    ext: { kind: record.kind },
  };
}

export function legacyPulsePackFromRecords(
  records: readonly EnsemblyRecord[],
  options: { exportedAt: string; sourceHost?: string; format?: LegacyPulsePack["format"] },
): LegacyPulsePack {
  const archive = records.map((record) => archiveEventFromRecord(record));
  const traces = records.filter((record) => canPromote(record)).map((record) => traceFromRecord(record));
  const format = options.format ?? legacyEnsemblyPulsePackFormat;
  return {
    format,
    exported_at: options.exportedAt,
    source_host: options.sourceHost ?? "visualizer",
    pack_hash: packHash(traces, archive, null),
    memory_traces: traces,
    archive_events: archive,
    memory_crdt: null,
  };
}

export function exportPulsePack(
  records: readonly EnsemblyRecord[],
  options: { exportedAt: string; sourceHost?: string },
): CanonPulsePack {
  const archive = sortArchive(records.map((record) => canonArchiveFromRecord(record)));
  const traces = sortTraces(
    records.filter((record) => canPromote(record)).map((record) => canonTraceFromRecord(record)),
  );
  return {
    schema: pulsePackSchema,
    format: pulsePackFormat,
    exported_at: options.exportedAt,
    host: options.sourceHost ?? "visualizer",
    traces,
    archive,
    ext: { content_sha256: contentSha256(archive, traces) },
  };
}

function isLegacyFormat(format: string): format is LegacyPulsePack["format"] {
  return format === legacyEnsemblyPulsePackFormat || format === legacyPulsePackFormat;
}

function readLegacyPack(pack: Record<string, unknown>): LegacyPulsePack {
  if (typeof pack.format !== "string" || !isLegacyFormat(pack.format)) {
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

function readCanonPack(raw: unknown): CanonPulsePack {
  const parsed = CanonPackSchema.safeParse(raw);
  if (!parsed.success) {
    if (floatIssue(parsed.error)) throw new Error("Ensembly pulse pack rejected a float.");
    throw new Error("Ensembly pulse pack is not a Canon 1 object.");
  }
  const traces = sortTraces(parsed.data.traces.map((trace) => canonTrace(trace)));
  const archive = sortArchive((parsed.data.archive ?? []).map((event) => canonArchive(event)));
  const expected = contentSha256(archive, traces);
  if (parsed.data.ext.content_sha256 !== expected) {
    throw new Error("Ensembly pulse pack hash does not match its traces and archive.");
  }
  return {
    schema: pulsePackSchema,
    format: pulsePackFormat,
    exported_at: parsed.data.exported_at,
    host: parsed.data.host,
    traces,
    archive,
    ext: { content_sha256: expected },
  };
}

function namedFormat(raw: unknown): string | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const pack = raw as Record<string, unknown>;
  if (typeof pack.format === "string") return pack.format;
  if (typeof pack.schema === "string") return pack.schema;
  return null;
}

export function readPulsePack(raw: unknown): PulsePack {
  if (typeof raw === "string") {
    const format = /"format"\s*:\s*"([^"]+)"/.exec(raw)?.[1] ?? /"schema"\s*:\s*"([^"]+)"/.exec(raw)?.[1];
    if (format === pulsePackSchema) rejectFloatLiterals(raw);
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      throw new Error("Ensembly pulse pack is not an object.");
    }
    return readPulsePack(value);
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Ensembly pulse pack is not an object.");
  }
  const format = namedFormat(raw);
  if (format === pulsePackSchema) return readCanonPack(raw);
  if (format && isLegacyFormat(format)) return readLegacyPack(raw as Record<string, unknown>);
  throw new Error("Ensembly pulse pack format is not recognized.");
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

function isCanonPack(pack: PulsePack): pack is CanonPulsePack {
  return pack.format === pulsePackSchema && "traces" in pack;
}

function payloadObject(raw: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function recordsFromPack(pack: PulsePack): EnsemblyRecord[] {
  if (isCanonPack(pack)) {
    const records: EnsemblyRecord[] = [];
    for (const event of pack.archive) {
      const payload = payloadObject(event.payload);
      if (!payload) continue;
      const record = recordFromPayload(event.ext.kind, payload, event.correlation_id, event.ts);
      if (record) records.push(record);
    }
    if (records.length > 0) return records;
    for (const trace of pack.traces) {
      const record = recordFromPayload(trace.ext.kind, trace.ext.content, trace.nat_key, trace.time, {
        traceKind: trace.kind,
        status: trace.status,
        lock: trace.lock,
        verifyHash: trace.verify_hash,
        prefetchKey: trace.prefetch_key,
        supersededBy: trace.superseded_by,
        coherenceMilli: trace.ext.coherence_milli,
      });
      if (record) records.push(record);
    }
    return records;
  }
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
