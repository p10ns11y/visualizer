import {
  pulsePackSchema,
  type EnsemblyRecord,
  type PulseLock,
  type PulseStatus,
  type PulseTraceKind,
} from "../state/schema.js";
import { admittedKind, admittedStatus, canPromote } from "./promote.js";

export const pulseInjectTraceLimit = 8;
export const pulseInjectTokenBudget = 120;
const bytesPerToken = 4;

export type PulseInjectTrace = {
  nat_key: string;
  snippet: string;
  kind: PulseTraceKind;
  status: PulseStatus;
  lock: PulseLock;
  verify_hash: string | null;
  prefetch_key: string | null;
  superseded_by: string | null;
  coherence_milli: number;
};

export type PulseInject = {
  schema: typeof pulsePackSchema;
  limit: typeof pulseInjectTraceLimit;
  token_budget: typeof pulseInjectTokenBudget;
  tokens: number;
  traces: PulseInjectTrace[];
};

export function estimateTokens(text: string): number {
  const bytes = new TextEncoder().encode(text).length;
  if (bytes === 0) return 0;
  return Math.ceil(bytes / bytesPerToken);
}

export function pulseInjectPromptText(inject: Pick<PulseInject, "schema" | "traces">): string {
  return JSON.stringify({ schema: inject.schema, traces: inject.traces });
}

function promptTokens(traces: readonly PulseInjectTrace[]): number {
  return estimateTokens(pulseInjectPromptText({ schema: pulsePackSchema, traces: [...traces] }));
}

function injectTrace(row: EnsemblyRecord, snippet: string): PulseInjectTrace {
  return {
    nat_key: row.id,
    snippet,
    kind: admittedKind(row),
    status: admittedStatus(row),
    lock: row.lock ?? "open",
    verify_hash: row.verifyHash ?? null,
    prefetch_key: row.prefetchKey ?? null,
    superseded_by: null,
    coherence_milli: row.coherenceMilli ?? 1000,
  };
}

function fits(traces: readonly PulseInjectTrace[]): boolean {
  return promptTokens(traces) <= pulseInjectTokenBudget;
}

function fitTrace(row: EnsemblyRecord): PulseInjectTrace | null {
  const full = injectTrace(row, row.summary);
  if (fits([full])) return full;
  const chars = Array.from(row.summary);
  let next = "";
  let chosen: string | null = null;
  for (const char of chars) {
    const candidate = next + char;
    if (!fits([injectTrace(row, candidate)])) break;
    next = candidate;
    chosen = candidate;
  }
  if (!chosen) return null;
  return injectTrace(row, chosen);
}

export function buildPulseInject(rows: readonly EnsemblyRecord[]): PulseInject {
  const ranked = rows
    .filter((row) => canPromote(row))
    .slice()
    .sort((left, right) => {
      const time = right.timestamp.localeCompare(left.timestamp);
      if (time !== 0) return time;
      return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
    });
  const traces: PulseInjectTrace[] = [];
  let skippedBulky = false;
  for (const row of ranked) {
    if (traces.length >= pulseInjectTraceLimit) break;
    const candidate = injectTrace(row, row.summary);
    if (fits([...traces, candidate])) {
      traces.push(candidate);
      continue;
    }
    skippedBulky = true;
  }
  if (traces.length === 0 && skippedBulky) {
    const row = ranked.find((item) => !fits([injectTrace(item, item.summary)]));
    const fitted = row ? fitTrace(row) : null;
    if (fitted) traces.push(fitted);
  }
  return {
    schema: pulsePackSchema,
    limit: pulseInjectTraceLimit,
    token_budget: pulseInjectTokenBudget,
    tokens: promptTokens(traces),
    traces,
  };
}
