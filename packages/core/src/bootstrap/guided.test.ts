import { describe, expect, it } from "vitest";
import { applyPilotEvent, assertCommit } from "../state/store.js";
import { createSampleWorkspace } from "../state/sample.js";
import { mergeAuxIntoTick } from "../state/merge-aux.js";
import { appendEnsemblyRecord, importEnsemblyRecords, promoteEnsemblyRecord, recordWorkflowLesson } from "../memory/commit.js";
import { exportPulsePack, recordsFromPack } from "../memory/ensembly.js";
import type { EnsemblyRecord } from "../state/schema.js";
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

  it("keeps a ledger append, a promotion, and a pack import that land during a tick", async () => {
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
            reason: "Held for the ledger merge.",
          });
        },
      },
    });
    const promotable: EnsemblyRecord = {
      id: "ens-mid-promote",
      timestamp: "2026-11-27T12:07:00Z",
      kind: "decision",
      summary: "Promote this row while the tick is awaiting.",
      rationale: "It is user-stated and not yet in Pulse.",
      provenance: "packages/core/src/bootstrap/guided.test.ts",
      confirmedOutcome: null,
      status: "user-stated",
    };
    const imported: EnsemblyRecord = {
      id: "ens-mid-import",
      timestamp: "2026-11-27T12:07:01Z",
      kind: "rule",
      summary: "Import this row while the tick is awaiting.",
      rationale: "The pack arrives before the tick lands.",
      provenance: "packages/core/src/bootstrap/guided.test.ts",
      confirmedOutcome: null,
    };
    const planning = assertCommit(applyPilotEvent(createSampleWorkspace(), 0, { type: "START" }));
    const seeded = {
      ...planning,
      ensemblyLedger: [promotable],
    };
    let live = seeded;
    const pending = runGuidedBuild(seeded, router, () => live);
    live = assertCommit(
      appendEnsemblyRecord(live, live.stateVersion, {
        id: "ens-mid-append",
        timestamp: "2026-11-27T12:07:02Z",
        kind: "rule",
        summary: "Append this row while the tick is awaiting.",
        rationale: "The ledger write must survive the tick.",
        provenance: "packages/core/src/bootstrap/guided.test.ts",
        confirmedOutcome: null,
      }),
    );
    live = assertCommit(promoteEnsemblyRecord(live, live.stateVersion, promotable.id));
    const pack = exportPulsePack([imported], { exportedAt: "2026-11-27T12:07:03Z" });
    live = assertCommit(importEnsemblyRecords(live, live.stateVersion, recordsFromPack(pack)));
    release();
    const result = await pending;
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const ledgerIds = result.state.ensemblyLedger.map((row) => row.id);
    expect(ledgerIds).toEqual(expect.arrayContaining(["ens-mid-promote", "ens-mid-append", "ens-mid-import"]));
    expect(result.state.pulseMemory.some((row) => row.id === promotable.id)).toBe(true);
    expect(result.state.autopilot.phase).toBe("planning");
    expect(result.state.stateVersion).toBe(seeded.stateVersion);
  });
});
