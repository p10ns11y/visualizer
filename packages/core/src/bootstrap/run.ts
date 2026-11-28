import type { CommitResult } from "../state/store.js";
import type { WorkspaceState } from "../state/schema.js";

export const buildTickOrder = ["start", "judge", "engage", "finish"] as const;
export type BuildTick = (typeof buildTickOrder)[number];

export async function applyBuildTick(
  state: WorkspaceState,
  expectedVersion: number,
  tick: BuildTick,
): Promise<CommitResult> {
  switch (tick) {
    case "start":
    case "judge":
    case "engage":
    case "finish":
      if (expectedVersion !== state.stateVersion) {
        return {
          ok: false,
          error: {
            code: "STATE_CONFLICT",
            expectedVersion,
            actualVersion: state.stateVersion,
          },
        };
      }
      return { ok: true, state };
    default: {
      const unreachable: never = tick;
      return unreachable;
    }
  }
}
