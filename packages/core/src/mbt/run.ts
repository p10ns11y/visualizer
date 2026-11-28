import { adjacencyMapToArray, getAdjacencyMap, getSimplePaths } from "xstate/graph";
import { applyFlowEvent, createFlow, flowValueKey } from "../flow/apply.js";
import { flowMachine } from "../flow/machine.js";
import { FlowStateSchema, type FlowEvent, type FlowState } from "../flow/schema.js";

export type MbtReport =
  | {
      ok: true;
      paths: number;
      steps: number;
      transitions: number;
    }
  | {
      ok: false;
      path: number;
      step: number;
      detail: string;
    };

function isFlowEvent(event: { type: string }): event is FlowEvent {
  return (
    event.type === "START" ||
    event.type === "PAUSE" ||
    event.type === "STOP" ||
    event.type === "TOGGLE_MODE" ||
    event.type === "RESET"
  );
}

function edgeId(from: string, type: string, to: string): string {
  return `${from}|${type}|${to}`;
}

function stateKey(state: FlowState): string {
  return `${state.stage}|${state.motion}|${state.mode}`;
}

function replay(pathSteps: ReadonlyArray<{ event: { type: string }; state: { value: unknown } }>): {
  state: FlowState;
  covered: string[];
  detail: string | null;
} {
  let state = createFlow();
  const covered: string[] = [];
  let previous = flowValueKey(pathSteps[0]?.state.value);
  for (let stepIndex = 0; stepIndex < pathSteps.length; stepIndex += 1) {
    const step = pathSteps[stepIndex];
    if (!step) return { state, covered, detail: "missing graph step" };
    if (step.event.type === "xstate.init") {
      if (flowValueKey(step.state.value) !== stateKey(state)) {
        return { state, covered, detail: "init left the asking state" };
      }
      previous = flowValueKey(step.state.value);
      continue;
    }
    if (!isFlowEvent(step.event)) {
      return { state, covered, detail: `graph event ${step.event.type} is not a flow event` };
    }
    const version = state.stateVersion;
    const committed = applyFlowEvent(state, version, step.event);
    if (!committed.ok) {
      return { state, covered, detail: `${step.event.type} was rejected from ${state.stage}` };
    }
    state = committed.state;
    if (state.stateVersion !== version + 1) {
      return { state, covered, detail: `stateVersion ${version} moved to ${state.stateVersion}` };
    }
    if (state.eventLog.length !== state.stateVersion) {
      return { state, covered, detail: "the log length diverged from stateVersion" };
    }
    const parsed = FlowStateSchema.safeParse(state);
    if (!parsed.success) return { state, covered, detail: "flow state failed schema validation" };
    const nextKey = flowValueKey(step.state.value);
    if (stateKey(state) !== nextKey) {
      return {
        state,
        covered,
        detail: `flow ${stateKey(state)} diverged from graph ${nextKey}`,
      };
    }
    covered.push(edgeId(previous, step.event.type, nextKey));
    previous = nextKey;
  }
  return { state, covered, detail: null };
}

export async function runModelBasedPaths(): Promise<MbtReport> {
  const paths = getSimplePaths(flowMachine);
  const edges = adjacencyMapToArray(getAdjacencyMap(flowMachine));
  const covered = new Set<string>();
  let steps = 0;
  const reached = new Map<string, FlowState>();

  for (let pathIndex = 0; pathIndex < paths.length; pathIndex += 1) {
    const path = paths[pathIndex];
    if (!path) return { ok: false, path: pathIndex, step: 0, detail: "missing path" };
    const played = replay(path.steps);
    if (played.detail) return { ok: false, path: pathIndex, step: steps, detail: played.detail };
    for (const id of played.covered) covered.add(id);
    steps += played.covered.length;
    reached.set(flowValueKey(path.state.value), played.state);
  }

  for (const edge of edges) {
    const from = flowValueKey(edge.state.value);
    const to = flowValueKey(edge.nextState.value);
    const id = edgeId(from, edge.event.type, to);
    if (covered.has(id)) continue;
    const source = reached.get(from);
    if (!source) {
      return { ok: false, path: paths.length, step: steps, detail: `no simple path reached ${from}` };
    }
    const committed = applyFlowEvent(source, source.stateVersion, edge.event);
    if (!committed.ok || stateKey(committed.state) !== to) {
      return {
        ok: false,
        path: paths.length,
        step: steps,
        detail: `${edge.event.type} from ${from} did not reach ${to}`,
      };
    }
    if (committed.state.eventLog.length !== source.eventLog.length + 1) {
      return { ok: false, path: paths.length, step: steps, detail: `${id} was not logged` };
    }
    covered.add(id);
    steps += 1;
  }

  const missing = edges.filter((edge) => {
    const id = edgeId(
      flowValueKey(edge.state.value),
      edge.event.type,
      flowValueKey(edge.nextState.value),
    );
    return !covered.has(id);
  });
  if (missing.length > 0) {
    return {
      ok: false,
      path: paths.length,
      step: steps,
      detail: `uncovered transitions ${missing.length}`,
    };
  }
  return { ok: true, paths: paths.length, steps, transitions: edges.length };
}
