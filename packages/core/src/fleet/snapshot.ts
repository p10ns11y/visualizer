import { estimateTokens } from "../memory/pulse-inject.js";
import type { WorkspaceState } from "../state/schema.js";
import { fleetActions } from "./actions.js";
import { analyzeFleet } from "./analyze.js";

export type UiControlSnapshot = {
  ref: string;
  component: string;
  label?: string;
  actions: string[];
};

export type CockpitSnapshot = {
  stateVersion: number;
  phase: WorkspaceState["autopilot"]["phase"];
  nodes: Array<{ id: string; kind: string; label: string }>;
  edges: Array<{ id: string; fromId: string; toId: string; kind: string; live: boolean }>;
  findings: Array<{ code: string; subjectIds: string[] }>;
  actions: Array<{ id: string; kind: string; label: string }>;
  proposals: Array<{ id: string; actionId: string; status: string }>;
  controls: UiControlSnapshot[];
};

export function buildCockpitSnapshot(
  state: WorkspaceState,
  controls: readonly UiControlSnapshot[] = [],
): CockpitSnapshot {
  return {
    stateVersion: state.stateVersion,
    phase: state.autopilot.phase,
    nodes: state.fleetGraph.nodes.map((node) => ({ id: node.id, kind: node.kind, label: node.label })),
    edges: state.fleetGraph.edges.map((edge) => ({
      id: edge.id,
      fromId: edge.fromId,
      toId: edge.toId,
      kind: edge.kind,
      live: edge.live,
    })),
    findings: analyzeFleet(state.fleetGraph).map((finding) => ({
      code: finding.code,
      subjectIds: finding.subjectIds,
    })),
    actions: fleetActions(state.fleetGraph).map((action) => ({
      id: action.id,
      kind: action.kind,
      label: action.label,
    })),
    proposals: state.fleetProposals.map((proposal) => ({
      id: proposal.id,
      actionId: proposal.actionId,
      status: proposal.status,
    })),
    controls: controls.map((control) => ({
      ref: control.ref,
      component: control.component,
      ...(control.label ? { label: control.label } : {}),
      actions: [...control.actions],
    })),
  };
}

function accessibilityTree(state: WorkspaceState): string {
  const lines = ["role region", "name Interconnection map"];
  for (const node of state.fleetGraph.nodes) {
    lines.push(
      `role article`,
      `name ${node.label}`,
      `description ${node.summary}`,
      `kind ${node.kind}`,
      `id ${node.id}`,
    );
  }
  for (const edge of state.fleetGraph.edges) {
    lines.push(
      `role graphics-symbol`,
      `name ${edge.label}`,
      `from ${edge.fromId}`,
      `to ${edge.toId}`,
      `kind ${edge.kind}`,
      `live ${edge.live}`,
    );
  }
  for (const finding of analyzeFleet(state.fleetGraph)) {
    lines.push(`role status`, `name ${finding.summary}`, `code ${finding.code}`, finding.subjectIds.join(" "));
  }
  for (const action of fleetActions(state.fleetGraph)) {
    lines.push(`role button`, `name ${action.label}`, `description ${action.summary}`, `id ${action.id}`);
  }
  return lines.join("\n");
}

function domTree(state: WorkspaceState): string {
  const parts = ['<section class="fleet-map" aria-label="Interconnection map">'];
  for (const node of state.fleetGraph.nodes) {
    parts.push(
      `<article class="fleet-node fleet-node-${node.kind}" data-node-id="${node.id}" aria-label="${node.label}"><p>${node.kind}</p><h3>${node.label}</h3><p>${node.summary}</p></article>`,
    );
  }
  for (const edge of state.fleetGraph.edges) {
    parts.push(
      `<path class="fleet-edge" data-edge-id="${edge.id}" data-from="${edge.fromId}" data-to="${edge.toId}" data-kind="${edge.kind}" data-live="${edge.live}"><title>${edge.label}</title></path>`,
    );
  }
  for (const finding of analyzeFleet(state.fleetGraph)) {
    parts.push(`<li class="fleet-finding" data-code="${finding.code}">${finding.summary}</li>`);
  }
  parts.push("</section>");
  return parts.join("");
}

export type CockpitTokenReport = {
  snapshotTokens: number;
  accessibilityTokens: number;
  domTokens: number;
};

export function measureCockpitSurface(
  state: WorkspaceState,
  controls: readonly UiControlSnapshot[] = [],
): CockpitTokenReport {
  return {
    snapshotTokens: estimateTokens(JSON.stringify(buildCockpitSnapshot(state, controls))),
    accessibilityTokens: estimateTokens(accessibilityTree(state)),
    domTokens: estimateTokens(domTree(state)),
  };
}
