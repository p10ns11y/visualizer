import { initialTransition, transition } from "xstate";
import { flowMachine } from "./machine.js";
import {
  eventLogLimit,
  FlowStateSchema,
  type FlowEvent,
  type FlowLogEntry,
  type FlowMotion,
  type FlowMode,
  type FlowStage,
  type FlowState,
} from "./schema.js";

export type FlowConflict = {
  code: "STATE_CONFLICT";
  expectedVersion: number;
  actualVersion: number;
};

export type FlowResult =
  | { ok: true; state: FlowState }
  | { ok: false; error: FlowConflict };

type ReadFlow = {
  stage: FlowStage;
  motion: FlowMotion;
  mode: FlowMode;
};

function isStage(value: string): value is FlowStage {
  return (
    value === "asking" ||
    value === "editing" ||
    value === "choosingTools" ||
    value === "building" ||
    value === "done"
  );
}

export function readFlowValue(value: unknown): ReadFlow {
  if (typeof value !== "object" || value === null) {
    throw new Error("Flow value is not a state");
  }
  const record = value as { stage?: unknown; mode?: unknown };
  if (record.mode !== "simple" && record.mode !== "advanced") {
    throw new Error("Flow mode left the set");
  }
  if (record.stage === "done") {
    return { stage: "done", motion: "live", mode: record.mode };
  }
  if (typeof record.stage !== "object" || record.stage === null) {
    throw new Error("Flow stage left the set");
  }
  const stageKey = Object.keys(record.stage)[0];
  if (!stageKey || !isStage(stageKey) || stageKey === "done") {
    throw new Error("Flow stage left the set");
  }
  const motion = (record.stage as Record<string, unknown>)[stageKey];
  if (motion !== "live" && motion !== "paused") {
    throw new Error("Flow motion left the set");
  }
  return { stage: stageKey, motion, mode: record.mode };
}

export function flowValueKey(value: unknown): string {
  const read = readFlowValue(value);
  return `${read.stage}|${read.motion}|${read.mode}`;
}

function storedValue(state: FlowState): { stage: string | Record<string, FlowMotion>; mode: FlowMode } {
  switch (state.stage) {
    case "done":
      return { stage: "done", mode: state.mode };
    case "asking":
    case "editing":
    case "choosingTools":
    case "building":
      return { stage: { [state.stage]: state.motion }, mode: state.mode };
    default: {
      const unreachable: never = state.stage;
      return unreachable;
    }
  }
}

function snapshotOf(state: FlowState) {
  const snapshot = flowMachine.resolveState({ value: storedValue(state) });
  const stored = `${state.stage}|${state.motion}|${state.mode}`;
  if (flowValueKey(snapshot.value) !== stored) {
    throw new Error("Stored flow does not match the machine");
  }
  return snapshot;
}

function conflict(state: FlowState, expectedVersion: number): FlowResult {
  return {
    ok: false,
    error: {
      code: "STATE_CONFLICT",
      expectedVersion,
      actualVersion: state.stateVersion,
    },
  };
}

export function createFlow(): FlowState {
  const [snapshot] = initialTransition(flowMachine);
  return FlowStateSchema.parse({
    stateVersion: 0,
    ...readFlowValue(snapshot.value),
    eventLog: [],
  });
}

function rememberLog(entries: readonly FlowLogEntry[], entry: FlowLogEntry): FlowLogEntry[] {
  if (entries.length < eventLogLimit) return [...entries, entry];
  return [...entries.slice(entries.length - eventLogLimit + 1), entry];
}

export function flowCan(state: FlowState, event: FlowEvent): boolean {
  const snapshot = snapshotOf(state);
  const [next] = transition(flowMachine, snapshot, event);
  return flowValueKey(next.value) !== flowValueKey(snapshot.value);
}

export function applyFlowEvent(
  state: FlowState,
  expectedVersion: number,
  event: FlowEvent,
): FlowResult {
  if (expectedVersion !== state.stateVersion) return conflict(state, expectedVersion);
  const snapshot = snapshotOf(state);
  const [next] = transition(flowMachine, snapshot, event);
  if (flowValueKey(next.value) === flowValueKey(snapshot.value)) {
    return { ok: true, state };
  }
  const read = readFlowValue(next.value);
  const stateVersion = state.stateVersion + 1;
  const entry: FlowLogEntry = {
    id: `log-${stateVersion}`,
    stateVersion,
    type: event.type,
    fromStage: state.stage,
    toStage: read.stage,
    fromMotion: state.motion,
    toMotion: read.motion,
    fromMode: state.mode,
    toMode: read.mode,
  };
  return {
    ok: true,
    state: FlowStateSchema.parse({
      stateVersion,
      ...read,
      eventLog: rememberLog(state.eventLog, entry),
    }),
  };
}
