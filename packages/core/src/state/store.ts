import { reducePhase } from "../railway/pilot.js";
import {
  WorkspaceStateSchema,
  bannerFor,
  workingPhases,
  type LogEntry,
  type PilotEvent,
  type PilotPhase,
  type WorkspaceState,
} from "./schema.js";

export type ConflictError = {
  code: "STATE_CONFLICT";
  expectedVersion: number;
  actualVersion: number;
};

export type TransitionError = {
  code: "ILLEGAL_TRANSITION";
  from: PilotPhase;
  event: PilotEvent["type"];
};

export type CommitError = ConflictError | TransitionError;

export type CommitResult =
  | { ok: true; state: WorkspaceState }
  | { ok: false; error: CommitError };

export class StateConflictError extends Error {
  readonly code = "STATE_CONFLICT" as const;
  readonly expectedVersion: number;
  readonly actualVersion: number;

  constructor(expectedVersion: number, actualVersion: number) {
    super(
      `Stale stateVersion ${expectedVersion}; current is ${actualVersion}.`,
    );
    this.name = "StateConflictError";
    this.expectedVersion = expectedVersion;
    this.actualVersion = actualVersion;
  }
}

function conflict(state: WorkspaceState, expectedVersion: number): CommitResult {
  return {
    ok: false,
    error: {
      code: "STATE_CONFLICT",
      expectedVersion,
      actualVersion: state.stateVersion,
    },
  };
}

function withLog(
  state: WorkspaceState,
  entry: Omit<LogEntry, "id" | "stateVersion">,
): WorkspaceState {
  const stateVersion = state.stateVersion + 1;
  const logSeq = state.logSeq + 1;
  return WorkspaceStateSchema.parse({
    ...state,
    stateVersion,
    logSeq,
    eventLog: [
      ...state.eventLog,
      { ...entry, id: `log-${logSeq}`, stateVersion },
    ],
  });
}

export function applyPilotEvent(
  state: WorkspaceState,
  expectedVersion: number,
  event: PilotEvent,
  patch?: (state: WorkspaceState) => WorkspaceState,
  logMessage?: string,
): CommitResult {
  if (expectedVersion !== state.stateVersion) return conflict(state, expectedVersion);
  const from = state.autopilot.phase;
  const trace = [...state.autopilot.trace, event];
  const to = reducePhase(trace);
  if (to === from) {
    return {
      ok: false,
      error: { code: "ILLEGAL_TRANSITION", from, event: event.type },
    };
  }
  let next: WorkspaceState = {
    ...state,
    autopilot: {
      ...state.autopilot,
      phase: to,
      trace,
      banner: bannerFor(to),
    },
  };
  if (patch) next = patch(next);
  next = {
    ...next,
    autopilot: {
      ...next.autopilot,
      phase: to,
      banner: bannerFor(to),
      trace,
    },
  };
  return {
    ok: true,
    state: withLog(next, {
      kind: "transition",
      message: logMessage ?? `${from} to ${to} on ${event.type}`,
      from,
      to,
    }),
  };
}

export function commitHuman(
  state: WorkspaceState,
  expectedVersion: number,
  mutate: (state: WorkspaceState) => WorkspaceState,
): CommitResult {
  if (expectedVersion !== state.stateVersion) return conflict(state, expectedVersion);
  const edited = mutate(structuredClone(state));
  const from = edited.autopilot.phase;
  const working = workingPhases.includes(from);
  let phase = from;
  let trace = edited.autopilot.trace;
  if (working) {
    trace = [...trace, { type: "HUMAN_PAUSE" }];
    phase = reducePhase(trace);
  }
  const next = withLog(
    {
      ...edited,
      autopilot: {
        ...edited.autopilot,
        phase,
        trace,
        banner: bannerFor(phase),
      },
    },
    {
      kind: "human",
      message: working ? "Human edit paused the run" : "Human edit recorded",
      ...(working ? { from, to: phase } : {}),
    },
  );
  return { ok: true, state: next };
}

export function commitView(
  state: WorkspaceState,
  expectedVersion: number,
  mode: WorkspaceState["mode"],
): CommitResult {
  if (expectedVersion !== state.stateVersion) return conflict(state, expectedVersion);
  if (state.mode === mode) return { ok: true, state };
  return {
    ok: true,
    state: withLog(
      { ...state, mode },
      {
        kind: "view",
        message: mode === "code" ? "Opened Code Mode" : "Opened Visual Cockpit",
      },
    ),
  };
}

export function pauseRun(
  state: WorkspaceState,
  expectedVersion: number,
): CommitResult {
  if (!workingPhases.includes(state.autopilot.phase)) {
    if (expectedVersion !== state.stateVersion) return conflict(state, expectedVersion);
    return { ok: true, state };
  }
  return applyPilotEvent(state, expectedVersion, { type: "HUMAN_PAUSE" });
}

export function resumeRun(
  state: WorkspaceState,
  expectedVersion: number,
): CommitResult {
  if (state.autopilot.phase !== "paused_by_human") {
    if (expectedVersion !== state.stateVersion) return conflict(state, expectedVersion);
    return { ok: true, state };
  }
  return applyPilotEvent(state, expectedVersion, { type: "RESUME" });
}

export function assertCommit(result: CommitResult): WorkspaceState {
  if (!result.ok) {
    if (result.error.code === "STATE_CONFLICT") {
      throw new StateConflictError(
        result.error.expectedVersion,
        result.error.actualVersion,
      );
    }
    throw new Error(
      `Illegal transition ${result.error.event} from ${result.error.from}`,
    );
  }
  return result.state;
}
