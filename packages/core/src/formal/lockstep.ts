import { applyBuildTick, type BuildTick } from "../bootstrap/run.js";
import { pilotMachine } from "../railway/pilot.js";
import { createStandIn } from "../state/stand-in.js";
import {
  applyPilotEvent,
  commitHuman,
  commitView,
  pauseRun,
  resumeRun,
  type CommitResult,
} from "../state/store.js";
import {
  pilotPhases,
  type PilotEvent,
  type PilotPhase,
  type WorkspaceState,
} from "../state/schema.js";

const MAX_VERSION = 8;
const MAX_FINGERPRINTS = 1500;
const MARKER = " Lockstep kept.";

const agentEvents: readonly PilotEvent[] = [
  { type: "START" },
  { type: "PLAN_READY" },
  { type: "DRIFT" },
  { type: "CLEAR" },
  { type: "COMPLETE" },
  { type: "FAIL", reason: "runner unavailable" },
];

const ticks: readonly BuildTick[] = ["start", "judge", "engage", "finish"];
const resting: ReadonlySet<PilotPhase> = new Set([
  "completed",
  "failed",
  "paused_by_human",
]);

type Expectation = "current" | "stale";

type Action =
  | { kind: "pilot"; event: PilotEvent; expected: Expectation }
  | { kind: "human"; expected: Expectation }
  | { kind: "pause"; expected: Expectation }
  | { kind: "resume"; expected: Expectation }
  | { kind: "view"; expected: Expectation }
  | { kind: "tick"; tick: BuildTick; expected: Expectation };

export type LockstepReport =
  | {
      ok: true;
      fingerprints: number;
      transitions: number;
      maxVersion: number;
      maxFingerprints: number;
    }
  | {
      ok: false;
      property: string;
      detail: string;
      counterexample: readonly string[];
    };

function versionOf(state: WorkspaceState, expected: Expectation): number {
  if (expected === "current") return state.stateVersion;
  return state.stateVersion === 0 ? 1 : state.stateVersion - 1;
}

function fingerprint(state: WorkspaceState): string {
  return [
    state.autopilot.phase,
    state.autopilot.cursor,
    state.autopilot.banner,
    state.mode,
    state.problemCards.some((card) => card.statement.includes(MARKER)) ? "1" : "0",
    state.brief ? "1" : "0",
    state.autopilot.judgement ? String(state.autopilot.judgement.tier) : "0",
    state.autopilot.trace.map((event) => event.type).join("."),
  ].join("|");
}

function snapshot(state: WorkspaceState): string {
  return JSON.stringify(state);
}

function label(action: Action): string {
  switch (action.kind) {
    case "pilot":
      return `agent ${action.event.type} (${action.expected})`;
    case "human":
      return `human edit (${action.expected})`;
    case "pause":
      return `human pause (${action.expected})`;
    case "resume":
      return `human resume (${action.expected})`;
    case "view":
      return `view toggle (${action.expected})`;
    case "tick":
      return `agent tick ${action.tick} (${action.expected})`;
    default: {
      const unreachable: never = action;
      return unreachable;
    }
  }
}

function isAgent(action: Action): boolean {
  return action.kind === "pilot" || action.kind === "tick";
}

async function dispatch(state: WorkspaceState, action: Action): Promise<CommitResult> {
  const expected = versionOf(state, action.expected);
  switch (action.kind) {
    case "pilot":
      return applyPilotEvent(state, expected, action.event);
    case "human":
      return commitHuman(state, expected, (draft) => ({
        ...draft,
        problemCards: draft.problemCards.map((card, index) =>
          index === 0 ? { ...card, statement: `${card.statement}${MARKER}` } : card,
        ),
      }));
    case "pause":
      return pauseRun(state, expected);
    case "resume":
      return resumeRun(state, expected);
    case "view":
      return commitView(state, expected, state.mode === "cockpit" ? "code" : "cockpit");
    case "tick":
      return applyBuildTick(state, expected, action.tick);
    default: {
      const unreachable: never = action;
      return unreachable;
    }
  }
}

function actionsFor(state: WorkspaceState): Action[] {
  const expectations: Expectation[] = ["current", "stale"];
  const actions: Action[] = [];
  for (const expected of expectations) {
    for (const event of agentEvents) actions.push({ kind: "pilot", event, expected });
    for (const tick of ticks) actions.push({ kind: "tick", tick, expected });
    if (!state.problemCards[0]?.statement.includes(MARKER)) {
      actions.push({ kind: "human", expected });
    }
    actions.push({ kind: "pause", expected });
    actions.push({ kind: "resume", expected });
    actions.push({ kind: "view", expected });
  }
  return actions;
}

function fail(
  property: string,
  detail: string,
  counterexample: readonly string[],
): LockstepReport {
  return { ok: false, property, detail, counterexample };
}

function checkResult(
  before: WorkspaceState,
  beforeJson: string,
  action: Action,
  result: CommitResult,
  trace: readonly string[],
): LockstepReport | null {
  if (snapshot(before) !== beforeJson) {
    return fail(
      "input intact",
      `${label(action)} mutated the caller's workspace`,
      trace,
    );
  }
  if (!result.ok) {
    if (action.expected === "stale" && result.error.code !== "STATE_CONFLICT") {
      return fail(
        "stale-write rejection",
        `${label(action)} rejected a stale version with ${result.error.code}`,
        trace,
      );
    }
    return null;
  }
  const after = result.state;
  if (action.expected === "stale" && snapshot(after) !== beforeJson) {
    return fail(
      "stale-write rejection",
      `${label(action)} committed from version ${versionOf(before, "stale")} while current was ${before.stateVersion}`,
      trace,
    );
  }
  if (snapshot(after) === beforeJson) return null;
  if (after.stateVersion !== before.stateVersion + 1) {
    return fail(
      "monotonic stateVersion",
      `${label(action)} moved stateVersion ${before.stateVersion} to ${after.stateVersion}`,
      trace,
    );
  }
  if (
    isAgent(action) &&
    (before.autopilot.phase === "paused_by_human" ||
      before.autopilot.phase === "completed" ||
      before.autopilot.phase === "failed")
  ) {
    return fail(
      "human-pause exclusivity",
      `${label(action)} committed during ${before.autopilot.phase}`,
      trace,
    );
  }
  return null;
}

async function witness(phase: PilotPhase): Promise<LockstepReport | null> {
  const setup: Record<PilotPhase, readonly PilotEvent[]> = {
    idle: [],
    planning: [{ type: "START" }],
    running: [{ type: "START" }, { type: "PLAN_READY" }],
    drift_detected: [{ type: "START" }, { type: "PLAN_READY" }, { type: "DRIFT" }],
    paused_by_human: [{ type: "START" }, { type: "HUMAN_PAUSE" }],
    resuming: [{ type: "START" }, { type: "HUMAN_PAUSE" }, { type: "RESUME" }],
    completed: [{ type: "START" }, { type: "PLAN_READY" }, { type: "COMPLETE" }],
    failed: [{ type: "START" }, { type: "FAIL", reason: "runner unavailable" }],
  };
  const rest: Record<PilotPhase, readonly PilotEvent[]> = {
    idle: [{ type: "START" }, { type: "PLAN_READY" }, { type: "COMPLETE" }],
    planning: [{ type: "HUMAN_PAUSE" }],
    running: [{ type: "COMPLETE" }],
    drift_detected: [{ type: "CLEAR" }, { type: "COMPLETE" }],
    paused_by_human: [{ type: "RESUME" }, { type: "COMPLETE" }],
    resuming: [{ type: "COMPLETE" }],
    completed: [],
    failed: [],
  };
  let state = createStandIn();
  const trace = [`reach ${phase}`];
  for (const event of setup[phase]) {
    const stepped = applyPilotEvent(state, state.stateVersion, event);
    trace.push(event.type);
    if (!stepped.ok) {
      return fail("reachability", `could not prepare ${phase}`, trace);
    }
    state = stepped.state;
  }
  if (state.autopilot.phase !== phase) {
    return fail(
      "reachability",
      `prepared ${state.autopilot.phase} instead of ${phase}`,
      trace,
    );
  }
  if (resting.has(state.autopilot.phase)) return null;
  for (const event of rest[phase]) {
    const stepped = applyPilotEvent(state, state.stateVersion, event);
    trace.push(event.type);
    if (!stepped.ok) {
      return fail("reachability", `${phase} cannot rest on ${event.type}`, trace);
    }
    state = stepped.state;
  }
  if (!resting.has(state.autopilot.phase)) {
    return fail(
      "reachability",
      `${phase} ended in ${state.autopilot.phase}`,
      trace,
    );
  }
  return null;
}

export async function checkLockstep(): Promise<LockstepReport> {
  for (const phase of pilotPhases) {
    const blocked = await witness(phase);
    if (blocked) return blocked;
  }

  const seen = new Set<string>();
  const queue: Array<{ state: WorkspaceState; trace: string[] }> = [
    { state: createStandIn(), trace: ["seed cockpit v0"] },
  ];
  let transitions = 0;

  while (queue.length > 0 && seen.size < MAX_FINGERPRINTS) {
    const current = queue.shift();
    if (!current) break;
    const key = fingerprint(current.state);
    if (seen.has(key)) continue;
    seen.add(key);
    if (current.state.stateVersion > MAX_VERSION) continue;

    for (const action of actionsFor(current.state)) {
      const beforeJson = snapshot(current.state);
      const result = await dispatch(current.state, action);
      transitions += 1;
      const step = [...current.trace, label(action)];
      const violation = checkResult(current.state, beforeJson, action, result, step);
      if (violation) return violation;
      if (!result.ok) continue;
      if (snapshot(result.state) === beforeJson) continue;
      if (result.state.stateVersion > MAX_VERSION) continue;
      const nextKey = fingerprint(result.state);
      if (!seen.has(nextKey)) queue.push({ state: result.state, trace: step });
    }
  }

  return {
    ok: true,
    fingerprints: seen.size,
    transitions,
    maxVersion: MAX_VERSION,
    maxFingerprints: MAX_FINGERPRINTS,
  };
}

export const lockstepBounds = {
  maxVersion: MAX_VERSION,
  maxFingerprints: MAX_FINGERPRINTS,
  machineId: pilotMachine.id,
};
