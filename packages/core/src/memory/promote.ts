import type { EnsemblyRecord } from "../state/schema.js";

export function canPromote(record: EnsemblyRecord): boolean {
  return record.confirmedOutcome !== null && record.confirmedOutcome.length > 0;
}
