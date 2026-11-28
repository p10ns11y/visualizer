import { describe, expect, it } from "vitest";
import { applyFlowEvent, createFlow, flowCan } from "./apply.js";
import { flowStateIds } from "./machine.js";
import {
  eventLogLimit,
  eventLogWindow,
  logLine,
  recentLog,
  stageLabel,
  type FlowLogEntry,
} from "./schema.js";
import checks from "../formal/flow.reach.checks.json";

function take(
  state: ReturnType<typeof createFlow>,
  type: "START" | "PAUSE" | "STOP" | "TOGGLE_MODE" | "RESET",
) {
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

  it("returns to the start after done", () => {
    let state = take(createFlow(), "TOGGLE_MODE");
    for (const stage of ["editing", "choosingTools", "building", "done"] as const) {
      state = take(state, "START");
      expect(state.stage).toBe(stage);
    }
    expect(flowCan(state, { type: "RESET" })).toBe(true);
    expect(flowCan(createFlow(), { type: "RESET" })).toBe(false);
    const reset = take(state, "RESET");
    expect(reset).toMatchObject({ stage: "asking", motion: "live", mode: "simple" });
    expect(logLine(reset.eventLog.at(-1)!)).toBe("RESET done to asking, advanced to simple");
  });

  it("keeps the latest log lines", () => {
    const entries: FlowLogEntry[] = Array.from({ length: eventLogWindow + 5 }, (_, index) => ({
      id: `log-${index + 1}`,
      stateVersion: index + 1,
      type: "TOGGLE_MODE",
      fromStage: "asking",
      toStage: "asking",
      fromMotion: "live",
      toMotion: "live",
      fromMode: index % 2 === 0 ? "simple" : "advanced",
      toMode: index % 2 === 0 ? "advanced" : "simple",
    }));
    const visible = recentLog(entries);
    expect(visible).toHaveLength(eventLogWindow);
    expect(visible[0]?.id).toBe(`log-${entries.length - eventLogWindow + 1}`);
    expect(visible.at(-1)?.id).toBe(`log-${entries.length}`);
  });

  it("stores only the latest log lines", () => {
    let state = createFlow();
    for (let step = 0; step < eventLogLimit + 1; step += 1) {
      state = take(state, "TOGGLE_MODE");
    }
    expect(state.stateVersion).toBe(eventLogLimit + 1);
    expect(state.eventLog).toHaveLength(eventLogLimit);
    expect(state.eventLog[0]?.stateVersion).toBe(2);
    expect(state.eventLog[0]?.id).toBe("log-2");
    expect(state.eventLog.at(-1)?.stateVersion).toBe(eventLogLimit + 1);
    expect(state.eventLog.at(-1)?.id).toBe(`log-${eventLogLimit + 1}`);
    const stale = applyFlowEvent(state, 0, { type: "STOP" });
    expect(stale.ok).toBe(false);
    expect(state.eventLog).toHaveLength(eventLogLimit);
  });

  it("applies the next event from the stored stage after the log wraps", () => {
    for (const count of [eventLogLimit + 1, 450]) {
      let state = createFlow();
      for (let step = 0; step < count; step += 1) state = take(state, "TOGGLE_MODE");
      const mode = count % 2 === 0 ? "simple" : "advanced";
      expect(state).toMatchObject({ stage: "asking", motion: "live", mode });
      expect(flowCan(state, { type: "TOGGLE_MODE" })).toBe(true);
      expect(flowCan(state, { type: "START" })).toBe(true);
      const toggled = take(state, "TOGGLE_MODE");
      expect(toggled).toMatchObject({
        stage: "asking",
        motion: "live",
        mode: mode === "simple" ? "advanced" : "simple",
      });
      const started = take(state, "START");
      expect(started).toMatchObject({ stage: "editing", motion: "live", mode });
    }
  });
});
