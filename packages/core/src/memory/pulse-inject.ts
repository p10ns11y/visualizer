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

function fitSnippet(snippet: string, remaining: number): string | null {
  if (estimateTokens(snippet) <= remaining) return snippet;
  const chars = Array.from(snippet);
  let next = "";
  for (const char of chars) {
    const candidate = next + char;
    if (estimateTokens(candidate) > remaining) break;
    next = candidate;
  }
  return next.length > 0 ? next : null;
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
  let tokens = 0;
  for (const row of ranked) {
    if (traces.length >= pulseInjectTraceLimit) break;
    const remaining = pulseInjectTokenBudget - tokens;
    if (remaining <= 0) break;
    const snippet = fitSnippet(row.summary, remaining);
    if (!snippet) break;
    const cost = estimateTokens(snippet);
    traces.push({
      nat_key: row.id,
      snippet,
      kind: admittedKind(row),
      status: admittedStatus(row),
      lock: row.lock ?? "open",
      verify_hash: row.verifyHash ?? null,
      prefetch_key: row.prefetchKey ?? null,
      superseded_by: null,
      coherence_milli: row.coherenceMilli ?? 1000,
    });
    tokens += cost;
  }
  return {
    schema: pulsePackSchema,
    limit: pulseInjectTraceLimit,
    token_budget: pulseInjectTokenBudget,
    tokens,
    traces,
  };
}
