import type { EnsemblyRecord, PulseStatus, PulseTraceKind } from "../state/schema.js";
import { sha256Hex } from "./sha256.js";

export function verifyHashFor(snippet: string): string {
  return `sha256:${sha256Hex(snippet)}`;
}

export function admittedStatus(record: EnsemblyRecord): PulseStatus {
  if (record.status === "tool-verified" || record.status === "user-stated") return record.status;
  if (record.confirmedOutcome !== null && record.confirmedOutcome.length > 0) return "user-stated";
  return record.status ?? "unknown";
}

export function admittedKind(record: EnsemblyRecord): PulseTraceKind {
  return record.traceKind ?? "memory";
}

export function canPromote(record: EnsemblyRecord): boolean {
  if (record.supersededBy) return false;
  if (record.status === "tool-verified") return record.verifyHash === verifyHashFor(record.summary);
  if (record.status === "user-stated") return true;
  return record.confirmedOutcome !== null && record.confirmedOutcome.length > 0;
}
