import { describe, expect, it } from "vitest";
import { applyPilotEvent, assertCommit } from "../state/store.js";
import { createSampleWorkspace } from "../state/sample.js";
import { mergeAuxIntoTick } from "../state/merge-aux.js";
import { recordWorkflowLesson } from "../memory/commit.js";
import { BrainRouter } from "../brain/router.js";
import { applyBuildTick } from "./run.js";
import { runGuidedBuild } from "./guided.js";

describe("headless tick merge", () => {
  it("keeps a lesson recorded while a build tick is awaiting", async () => {
    let release: () => void = () => undefined;
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
    let live = planning;
    const pending = applyBuildTick(planning, planning.stateVersion, "judge", router);
    live = assertCommit(
      recordWorkflowLesson(live, live.stateVersion, {
        id: "lesson-headless",
        recordedAt: "2026-11-27T12:05:00Z",
        phase: "planning",
        cardId: "card-canvas",
        signal: "rework",
        lesson: "A headless lesson stays on the tick.",
        adjustment: "Merge it in core.",
      }),
    );
    release();
    const tick = await pending;
    expect(tick.ok).toBe(true);
    if (!tick.ok) return;
    const merged = mergeAuxIntoTick(live, tick.state);
    expect(merged.workflowLessons.some((item) => item.id === "lesson-headless")).toBe(true);
    expect(merged.autopilot.phase).toBe(tick.state.autopilot.phase);
    expect(merged.stateVersion).toBe(tick.state.stateVersion);
    expect(merged.eventLog.some((entry) => entry.message.includes("lesson-headless"))).toBe(true);
  });

  it("applies the aux merge on the guided build path", async () => {
    let release: () => void = () => undefined;
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
            rank: 0.4,
            drift: false,
            reason: "Held for the guided merge.",
          });
        },
      },
    });
    const planning = assertCommit(applyPilotEvent(createSampleWorkspace(), 0, { type: "START" }));
    let live = planning;
    const pending = runGuidedBuild(planning, router, () => live);
    live = assertCommit(
      recordWorkflowLesson(planning, planning.stateVersion, {
        id: "lesson-guided",
        recordedAt: "2026-11-27T12:06:00Z",
        phase: "planning",
        cardId: "card-canvas",
        signal: "adjustment",
        lesson: "The guided loop keeps the lesson.",
        adjustment: "Read live state after the tick.",
      }),
    );
    release();
    const result = await pending;
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.workflowLessons.some((item) => item.id === "lesson-guided")).toBe(true);
    expect(result.state.autopilot.phase).toBe("planning");
    expect(result.state.stateVersion).toBe(planning.stateVersion);
  });
});
