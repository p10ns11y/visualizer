import { WorkspaceStateSchema, type WorkspaceState } from "./schema.js";

export function createStandIn(): WorkspaceState {
  return WorkspaceStateSchema.parse({
    stateVersion: 0,
    logSeq: 0,
    brief: null,
    problemCards: [
      {
        id: "shell",
        title: "Shell",
        statement: "Empty screen.",
        acceptance: "One screen is showing.",
      },
    ],
    autopilot: {
      phase: "idle",
      cursor: "start",
      trace: [],
      judgement: null,
      banner: "hidden",
    },
    eventLog: [],
  });
}
