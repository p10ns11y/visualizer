export type Page<T> = {
  items: T[];
  nextCursor: string | null;
};

export function pageRows<T extends object>(
  rows: readonly T[],
  limit: number | undefined,
  cursor: string | undefined,
): Page<T> | { error: string } {
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 100)) {
    return { error: "limit must be an integer from 1 to 100." };
  }
  let start = 0;
  if (cursor !== undefined) {
    if (!/^[0-9]+$/.test(cursor)) return { error: "cursor must be a decimal offset." };
    start = Number(cursor);
    if (start > rows.length) return { error: "cursor is past the end." };
  }
  if (rows.length === 0) return { items: [], nextCursor: null };
  const size = limit ?? Math.min(rows.length, 100);
  const items = rows.slice(start, start + size).map((row) => ({ ...row }));
  const next = start + items.length < rows.length ? String(start + items.length) : null;
  return { items, nextCursor: next };
}
