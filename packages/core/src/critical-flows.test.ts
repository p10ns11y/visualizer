import { describe, expect, it } from "vitest";
import { bareShell, bareShellDocument } from "./shell.js";

describe("bare shell", () => {
  it("CF-01 one empty screen", () => {
    expect(bareShell).toEqual({ screens: ["empty"], scroll: false });
    expect(bareShell.screens).toHaveLength(1);
    expect(bareShellDocument).toEqual(expect.any(Object));
  });
});
