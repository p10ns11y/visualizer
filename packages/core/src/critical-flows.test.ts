import { describe, expect, it } from "vitest";
import { applyFlowEvent, createFlow } from "./flow/apply.js";
import { flowModes, flowStages, logLine } from "./flow/schema.js";
import { shellScreen, shellScreenDocument } from "./shell.js";
import { viewFor } from "./view/map.js";

describe("flow screen", () => {
  it("CF-01 shows the stage and the event log", () => {
    expect(shellScreen).toEqual({
      screens: ["flow"],
      scroll: false,
      shows: ["stage", "view", "log"],
    });
    for (const mode of flowModes) {
      for (const stage of flowStages) {
        expect(viewFor(mode, stage).stage).toBe(stage);
      }
    }
    expect(viewFor("simple", "asking").nodes.some((node) => node.kind === "collapsible")).toBe(false);
    expect(viewFor("advanced", "asking").nodes.at(-1)).toEqual({ kind: "collapsible", label: "later" });
    expect(shellScreen.screens).toHaveLength(1);
    expect(shellScreenDocument).toEqual(expect.any(Object));
    const start = createFlow();
    expect(start.stage).toBe("asking");
    expect(start.mode).toBe("simple");
    expect(start.eventLog).toEqual([]);
    const stepped = applyFlowEvent(start, start.stateVersion, { type: "START" });
    expect(stepped.ok).toBe(true);
    if (!stepped.ok) return;
    expect(stepped.state.stage).toBe("editing");
    expect(stepped.state.eventLog).toHaveLength(1);
    expect(logLine(stepped.state.eventLog[0]!)).toBe("START asking to editing");
  });
});
