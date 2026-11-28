import { describe, expect, it } from "vitest";
import { applyFlowEvent, createFlow, flowCan } from "./apply.js";
import { flowStateIds } from "./machine.js";
import { logLine, stageLabel } from "./schema.js";
import checks from "../formal/flow.reach.checks.json";

function take(state: ReturnType<typeof createFlow>, type: "START" | "PAUSE" | "STOP" | "TOGGLE_MODE") {
  const next = applyFlowEvent(state, state.stateVersion, { type });
  expect(next.ok).toBe(true);
  if (!next.ok) throw new Error(type);
  expect(next.state).not.toBe(state);
  return next.state;
}

describe("flow graph", () => {
  it("starts in asking, simple, with an empty log", () => {
    const state = createFlow();
    expect(state).toMatchObject({
      stateVersion: 0,
      stage: "asking",
      motion: "live",
      mode: "simple",
      eventLog: [],
    });
    expect(stageLabel(state.stage)).toBe("asking");
  });

  it("records Start, Pause, resume, and Stop, and ignores a later Start", () => {
    const started = take(createFlow(), "START");
    expect(started.stage).toBe("editing");
    expect(logLine(started.eventLog[0]!)).toBe("START asking to editing");
    const paused = take(started, "PAUSE");
    expect(paused.motion).toBe("paused");
    expect(paused.stage).toBe("editing");
    expect(logLine(paused.eventLog[1]!)).toBe("PAUSE editing to editing paused");
    const resumed = take(paused, "START");
    expect(resumed.stage).toBe("editing");
    expect(resumed.motion).toBe("live");
    expect(logLine(resumed.eventLog[2]!)).toBe("START editing paused to editing");
    const stopped = take(resumed, "STOP");
    expect(stopped.stage).toBe("done");
    expect(stopped.stateVersion).toBe(4);
    expect(flowCan(stopped, { type: "START" })).toBe(false);
    const ignored = applyFlowEvent(stopped, stopped.stateVersion, { type: "START" });
    expect(ignored).toEqual({ ok: true, state: stopped });
    expect(stopped.eventLog).toHaveLength(4);
  });

  it("toggles mode without changing the stage", () => {
    const toggled = take(createFlow(), "TOGGLE_MODE");
    expect(toggled.mode).toBe("advanced");
    expect(toggled.stage).toBe("asking");
    expect(logLine(toggled.eventLog[0]!)).toBe("TOGGLE_MODE simple to advanced");
    const back = take(toggled, "TOGGLE_MODE");
    expect(back.mode).toBe("simple");
    expect(back.stage).toBe("asking");
  });

  it("reaches done by Start and rejects a stale event", () => {
    let state = createFlow();
    const stages = ["editing", "choosingTools", "building", "done"] as const;
    for (const stage of stages) {
      state = take(state, "START");
      expect(state.stage).toBe(stage);
    }
    const frozen = structuredClone(state);
    const stale = applyFlowEvent(state, 0, { type: "TOGGLE_MODE" });
    expect(stale.ok).toBe(false);
    if (stale.ok) return;
    expect(stale.error).toEqual({
      code: "STATE_CONFLICT",
      expectedVersion: 0,
      actualVersion: 4,
    });
    expect(state).toEqual(frozen);
  });

  it("lists the same states the formal check names", () => {
    expect(checks.reachable).toEqual([...flowStateIds]);
  });
});
