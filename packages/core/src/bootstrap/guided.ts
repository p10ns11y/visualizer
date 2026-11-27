import { BrainRouter } from "../brain/router.js";
import { mergeAuxIntoTick } from "../state/merge-aux.js";
import type { CommitResult } from "../state/store.js";
import type { WorkspaceState } from "../state/schema.js";
import { applyBuildTick, type BuildTick } from "./run.js";

function resting(state: WorkspaceState): boolean {
  return (
    state.autopilot.cursor === "done" ||
    state.autopilot.phase === "paused_by_human" ||
    state.autopilot.phase === "failed" ||
    state.autopilot.phase === "drift_detected" ||
    state.autopilot.phase === "completed"
  );
}

export async function runGuidedBuild(
  start: WorkspaceState,
  router: BrainRouter,
  live: () => WorkspaceState,
  publish?: (state: WorkspaceState) => void,
): Promise<CommitResult> {
  let current = start;
  let guard = 0;
  while (!resting(current)) {
    guard += 1;
    if (guard > 8) return { ok: true, state: current };
    const cursor = current.autopilot.cursor;
    if (cursor === "done") return { ok: true, state: current };
    const tick: BuildTick = cursor;
    const startedVersion = current.stateVersion;
    const result = await applyBuildTick(current, startedVersion, tick, router);
    if (!result.ok) return result;
    const seen = live();
    if (seen.stateVersion > startedVersion) {
      current = seen;
      continue;
    }
    const base = seen.stateVersion === startedVersion ? seen : current;
    current = mergeAuxIntoTick(base, result.state);
    publish?.(current);
  }
  return { ok: true, state: current };
}
