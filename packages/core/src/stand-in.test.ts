import { describe, expect, it } from "vitest";
import { applyBuildTick } from "./bootstrap/run.js";
import { createStandIn } from "./state/stand-in.js";
import { applyPilotEvent, pauseRun } from "./state/store.js";

describe("railway stand-in", () => {
  it("starts idle and records one pilot step", () => {
    const start = createStandIn();
    expect(start.autopilot.phase).toBe("idle");
    expect(start.stateVersion).toBe(0);
    const stepped = applyPilotEvent(start, 0, { type: "START" });
    expect(stepped.ok).toBe(true);
    if (!stepped.ok) return;
    expect(stepped.state.autopilot.phase).toBe("planning");
    expect(stepped.state.stateVersion).toBe(1);
  });

  it("rejects a stale pilot event and a stale tick", async () => {
    const start = createStandIn();
    const stale = applyPilotEvent(start, 1, { type: "START" });
    expect(stale.ok).toBe(false);
    if (stale.ok) return;
    expect(stale.error.code).toBe("STATE_CONFLICT");
    const tick = await applyBuildTick(start, 4, "start");
    expect(tick.ok).toBe(false);
    if (tick.ok) return;
    expect(tick.error.code).toBe("STATE_CONFLICT");
    expect(start.stateVersion).toBe(0);
  });

  it("does not move a paused railway on a tick", async () => {
    const start = createStandIn();
    const planned = applyPilotEvent(start, start.stateVersion, { type: "START" });
    if (!planned.ok) throw new Error("start failed");
    const paused = pauseRun(planned.state, planned.state.stateVersion);
    if (!paused.ok) throw new Error("pause failed");
    expect(paused.state.autopilot.phase).toBe("paused_by_human");
    const tick = await applyBuildTick(paused.state, paused.state.stateVersion, "judge");
    expect(tick.ok).toBe(true);
    if (!tick.ok) return;
    expect(tick.state).toBe(paused.state);
  });
});
