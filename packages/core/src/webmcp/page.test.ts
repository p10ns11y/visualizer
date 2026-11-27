import { describe, expect, it } from "vitest";
import { pageRows } from "./page.js";

const rows = [{ id: "a" }, { id: "b" }];

describe("pageRows", () => {
  it("rejects a bad limit before it looks at the rows", () => {
    expect(pageRows([], 0, undefined)).toEqual({ error: "limit must be an integer from 1 to 100." });
    expect(pageRows([], 1.5, undefined)).toEqual({ error: "limit must be an integer from 1 to 100." });
    expect(pageRows(rows, 101, undefined)).toEqual({ error: "limit must be an integer from 1 to 100." });
  });

  it("rejects a bad cursor on an empty list and when the offset is past the end", () => {
    expect(pageRows([], undefined, "nope")).toEqual({ error: "cursor must be a decimal offset." });
    expect(pageRows([], undefined, "1")).toEqual({ error: "cursor is past the end." });
    expect(pageRows(rows, undefined, "3")).toEqual({ error: "cursor is past the end." });
  });

  it("returns an empty page when the cursor equals the row count", () => {
    expect(pageRows(rows, undefined, "2")).toEqual({ items: [], nextCursor: null });
  });

  it("returns an empty page for an empty list when limit and cursor are valid", () => {
    expect(pageRows([], undefined, undefined)).toEqual({ items: [], nextCursor: null });
    expect(pageRows([], 1, "0")).toEqual({ items: [], nextCursor: null });
  });
});
