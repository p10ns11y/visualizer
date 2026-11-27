import {
  applyBuildTick,
  applyPilotEvent,
  assertCommit,
  BrainRouter,
  createSampleWorkspace,
  recordWorkflowLesson,
} from "@visualizer/core";
import { describe, expect, it } from "vitest";
import { mergeAuxIntoTick } from "@visualizer/core";

describe("build tick aux merge", () => {
  it("keeps a workflow lesson recorded while a build tick is awaiting", async () => {
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const router = new BrainRouter({
      prefer: 2,
      tier2: {
        complete: async () => {
          await held;
          return JSON.stringify({
            route: "freehand-canvas",
            rank: 0.5,
            drift: false,
            reason: "Held for the lesson.",
          });
        },
      },
    });
    const planning = assertCommit(applyPilotEvent(createSampleWorkspace(), 0, { type: "START" }));
    const pending = applyBuildTick(planning, planning.stateVersion, "judge", router);
    const lesson = assertCommit(
      recordWorkflowLesson(planning, planning.stateVersion, {
        id: "lesson-mid-await",
        recordedAt: "2026-11-27T12:05:00Z",
        phase: "planning",
        cardId: "card-canvas",
        signal: "rework",
        lesson: "A lesson during the tick stays.",
        adjustment: "Merge it onto the tick result.",
      }),
    );
    expect(lesson.stateVersion).toBe(planning.stateVersion);
    expect(lesson.autopilot.phase).toBe("planning");
    release();
    const tick = await pending;
    expect(tick.ok).toBe(true);
    if (!tick.ok) return;
    expect(tick.state.workflowLessons.some((item) => item.id === "lesson-mid-await")).toBe(false);
    const merged = mergeAuxIntoTick(lesson, tick.state);
    expect(merged.autopilot.cursor).toBe("engage");
    expect(merged.autopilot.phase).toBe(tick.state.autopilot.phase);
    expect(merged.stateVersion).toBe(tick.state.stateVersion);
    expect(merged.workflowLessons.some((item) => item.id === "lesson-mid-await")).toBe(true);
    expect(merged.eventLog.some((entry) => entry.kind === "judgement")).toBe(true);
    expect(merged.eventLog.some((entry) => entry.message.includes("lesson-mid-await"))).toBe(true);
    const ids = merged.eventLog.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
