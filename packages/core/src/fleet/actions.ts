import type { FleetGraph, FleetProposalKind } from "../state/schema.js";
import { analyzeFleet, liveEdges } from "./analyze.js";

export type FleetAction = {
  id: string;
  kind: FleetProposalKind;
  label: string;
  summary: string;
  subjectIds: string[];
};

function pairId(left: string, right: string): [string, string] {
  return left < right ? [left, right] : [right, left];
}

export function fleetActions(graph: FleetGraph): FleetAction[] {
  const actions: FleetAction[] = [];
  const labels = new Map(graph.nodes.map((node) => [node.id, node.label]));
  const routines = graph.nodes.filter((node) => node.kind === "routine").map((node) => node.id);
  const edges = liveEdges(graph);
  for (let index = 0; index < routines.length; index += 1) {
    for (let next = index + 1; next < routines.length; next += 1) {
      const [left, right] = pairId(routines[index]!, routines[next]!);
      const leftIn = new Set(edges.filter((edge) => edge.toId === left && edge.kind === "triggers").map((edge) => edge.fromId));
      const rightIn = new Set(edges.filter((edge) => edge.toId === right && edge.kind === "triggers").map((edge) => edge.fromId));
      const sharedIn = [...leftIn].filter((id) => rightIn.has(id));
      const leftOut = new Set(edges.filter((edge) => edge.fromId === left && edge.kind === "reads").map((edge) => edge.toId));
      const rightOut = new Set(edges.filter((edge) => edge.fromId === right && edge.kind === "reads").map((edge) => edge.toId));
      const sharedOut = [...leftOut].filter((id) => rightOut.has(id));
      if (sharedIn.length === 0 || sharedOut.length === 0) continue;
      actions.push({
        id: `merge-routines:${left}:${right}`,
        kind: "merge_routines",
        label: `Merge ${labels.get(left) ?? left} and ${labels.get(right) ?? right}`,
        summary: "These routines share a trigger and a read. Merge them after a person approves.",
        subjectIds: [left, right],
      });
    }
  }

  for (const finding of analyzeFleet(graph)) {
    if (finding.code === "cycle") {
      const ordered = [...finding.subjectIds].sort();
      actions.push({
        id: `flag-cycle:${ordered.join(":")}`,
        kind: "flag_cycle",
        label: `Flag cycle ${ordered.join(", ")}`,
        summary: finding.summary,
        subjectIds: finding.subjectIds,
      });
    } else if (finding.code === "fan_in" || finding.code === "fan_out") {
      const nodeId = finding.subjectIds[0] ?? finding.id;
      actions.push({
        id: `flag-hotspot:${nodeId}:${finding.code}`,
        kind: "flag_hotspot",
        label: `Flag ${finding.code === "fan_in" ? "fan-in" : "fan-out"} on ${labels.get(nodeId) ?? nodeId}`,
        summary: finding.summary,
        subjectIds: [nodeId],
      });
    } else if (finding.code === "dead_edge") {
      const edgeId = finding.subjectIds[0] ?? finding.id;
      actions.push({
        id: `mark-dead:${edgeId}`,
        kind: "mark_dead_edge",
        label: `Mark dead edge ${edgeId}`,
        summary: finding.summary,
        subjectIds: [edgeId],
      });
    }
  }
  return actions;
}

export function fleetActionById(graph: FleetGraph, actionId: string): FleetAction | null {
  return fleetActions(graph).find((action) => action.id === actionId) ?? null;
}
