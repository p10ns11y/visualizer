import { getAdjacencyMap, getShortestPaths, toDirectedGraph } from "xstate/graph";
import type { DirectedGraphNode } from "xstate/graph";
import { applyFlowEvent, createFlow, flowValueKey } from "../flow/apply.js";
import { flowMachine, flowStateIds } from "../flow/machine.js";
import { flowModes, flowMotions, flowStages } from "../flow/schema.js";

export type FlowGraphReport =
  | {
      ok: true;
      states: number;
      stateNodes: number;
      deadlocks: number;
    }
  | {
      ok: false;
      property: string;
      detail: string;
      counterexample: readonly string[];
    };

function fail(
  property: string,
  detail: string,
  counterexample: readonly string[],
): FlowGraphReport {
  return { ok: false, property, detail, counterexample };
}

function expectedKeys(): string[] {
  const keys: string[] = [];
  for (const stage of flowStages) {
    if (stage === "done") {
      for (const mode of flowModes) keys.push(`${stage}|live|${mode}`);
      continue;
    }
    for (const motion of flowMotions) {
      for (const mode of flowModes) keys.push(`${stage}|${motion}|${mode}`);
    }
  }
  return keys;
}

function leafDeadlocks(node: DirectedGraphNode): string[] {
  const found: string[] = [];
  const leaf = node.children.length === 0;
  const final = node.stateNode.type === "final";
  if (leaf && !final && node.edges.length === 0) found.push(node.id);
  for (const child of node.children) found.push(...leafDeadlocks(child));
  return found;
}

export function checkFlowGraph(): FlowGraphReport {
  const shortest = getShortestPaths(flowMachine);
  const seen = new Set(shortest.map((path) => flowValueKey(path.state.value)));
  const expected = expectedKeys();
  const missingStates = expected.filter((key) => !seen.has(key));
  if (missingStates.length > 0 || seen.size !== expected.length) {
    return fail(
      "reachability",
      `reachable states ${[...seen].sort().join(", ")}`,
      missingStates.length > 0 ? missingStates : ["unexpected state"],
    );
  }
  const missingNodes = flowStateIds.filter(
    (id) => !shortest.some((path) => path.state.matches(id)),
  );
  if (missingNodes.length > 0) {
    return fail("reachability", "a state node was not witnessed", missingNodes);
  }

  const deadlocks = leafDeadlocks(toDirectedGraph(flowMachine));
  if (deadlocks.length > 0) {
    return fail("non-final deadlock", "a non-final leaf has no transition", deadlocks);
  }
  const map = getAdjacencyMap(flowMachine);
  for (const node of Object.values(map)) {
    const outgoing = Object.keys(node.transitions);
    if (outgoing.length === 0 && node.state.status !== "done") {
      return fail(
        "non-final deadlock",
        `${flowValueKey(node.state.value)} has no outgoing event`,
        [flowValueKey(node.state.value)],
      );
    }
  }

  const start = createFlow();
  const stale = applyFlowEvent(start, 1, { type: "START" });
  if (stale.ok || stale.error.code !== "STATE_CONFLICT" || start.stateVersion !== 0) {
    return fail(
      "stale-write rejection",
      "a stale Start changed the flow",
      ["create", "START at version 1"],
    );
  }
  if (start.eventLog.length !== 0) {
    return fail("event log", "the initial log is not empty", ["create"]);
  }

  return {
    ok: true,
    states: seen.size,
    stateNodes: flowStateIds.length,
    deadlocks: 0,
  };
}

export const flowGraphBounds = {
  states: expectedKeys().length,
  stateNodes: flowStateIds.length,
  machineId: flowMachine.id,
};
