import type { FleetEdge, FleetGraph, FleetNode } from "../state/schema.js";

export const fleetHotspotDegree = 3;

export type FleetFinding = {
  code: "cycle" | "fan_in" | "fan_out" | "orphan" | "dead_edge";
  id: string;
  summary: string;
  subjectIds: string[];
  degree?: number;
};

function nodeMap(graph: FleetGraph): Map<string, FleetNode> {
  return new Map(graph.nodes.map((node) => [node.id, node]));
}

export function liveEdges(graph: FleetGraph): FleetEdge[] {
  const ids = new Set(graph.nodes.map((node) => node.id));
  return graph.edges.filter((edge) => edge.live && ids.has(edge.fromId) && ids.has(edge.toId));
}

function cycleKey(ids: readonly string[]): string {
  const reversed = [...ids].reverse();
  const forms = [ids, reversed].flatMap((row) =>
    row.map((_, index) => [...row.slice(index), ...row.slice(0, index)].join(">")),
  );
  forms.sort();
  return forms[0] ?? "";
}

export function findCycles(graph: FleetGraph): string[][] {
  const adjacent = new Map<string, string[]>();
  for (const edge of liveEdges(graph)) {
    const next = adjacent.get(edge.fromId) ?? [];
    next.push(edge.toId);
    adjacent.set(edge.fromId, next);
  }
  const cycles: string[][] = [];
  const seen = new Set<string>();
  const visiting = new Set<string>();
  const stack: string[] = [];

  function visit(id: string): void {
    visiting.add(id);
    stack.push(id);
    for (const next of adjacent.get(id) ?? []) {
      const at = stack.indexOf(next);
      if (at >= 0) {
        const cycle = stack.slice(at);
        const key = cycleKey(cycle);
        if (!seen.has(key)) {
          seen.add(key);
          cycles.push(cycle);
        }
        continue;
      }
      if (!visiting.has(next)) visit(next);
    }
    stack.pop();
    visiting.delete(id);
  }

  for (const node of graph.nodes) {
    if (!visiting.has(node.id)) visit(node.id);
  }
  return cycles;
}

export function analyzeFleet(graph: FleetGraph): FleetFinding[] {
  const findings: FleetFinding[] = [];
  const names = nodeMap(graph);
  const incoming = new Map<string, number>();
  const outgoing = new Map<string, number>();
  for (const node of graph.nodes) {
    incoming.set(node.id, 0);
    outgoing.set(node.id, 0);
  }
  for (const edge of liveEdges(graph)) {
    outgoing.set(edge.fromId, (outgoing.get(edge.fromId) ?? 0) + 1);
    incoming.set(edge.toId, (incoming.get(edge.toId) ?? 0) + 1);
  }

  for (const cycle of findCycles(graph)) {
    const labels = cycle.map((id) => names.get(id)?.label ?? id);
    findings.push({
      code: "cycle",
      id: `cycle:${cycleKey(cycle)}`,
      summary: `Cycle across ${labels.join(", ")}.`,
      subjectIds: [...cycle],
    });
  }

  for (const node of graph.nodes) {
    const fanIn = incoming.get(node.id) ?? 0;
    const fanOut = outgoing.get(node.id) ?? 0;
    if (fanIn >= fleetHotspotDegree) {
      findings.push({
        code: "fan_in",
        id: `fan-in:${node.id}`,
        summary: `${node.label} has fan-in ${fanIn}.`,
        subjectIds: [node.id],
        degree: fanIn,
      });
    }
    if (fanOut >= fleetHotspotDegree) {
      findings.push({
        code: "fan_out",
        id: `fan-out:${node.id}`,
        summary: `${node.label} has fan-out ${fanOut}.`,
        subjectIds: [node.id],
        degree: fanOut,
      });
    }
    if (fanIn === 0 && fanOut === 0) {
      findings.push({
        code: "orphan",
        id: `orphan:${node.id}`,
        summary: `${node.label} has no live edge.`,
        subjectIds: [node.id],
      });
    }
  }

  const ids = new Set(graph.nodes.map((node) => node.id));
  for (const edge of graph.edges) {
    if (!edge.live || !ids.has(edge.fromId) || !ids.has(edge.toId)) {
      findings.push({
        code: "dead_edge",
        id: `dead:${edge.id}`,
        summary: `${edge.label} from ${edge.fromId} to ${edge.toId} is dead.`,
        subjectIds: [edge.id],
      });
    }
  }
  return findings;
}
