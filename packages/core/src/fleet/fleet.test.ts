import { describe, expect, it } from "vitest";
import { applyBuildTick } from "../bootstrap/run.js";
import { BrainRouter } from "../brain/router.js";
import { mergeAuxIntoTick } from "../state/merge-aux.js";
import { createSampleWorkspace } from "../state/sample.js";
import { applyPilotEvent, assertCommit } from "../state/store.js";
import { fleetActionById } from "./actions.js";
import { analyzeFleet } from "./analyze.js";
import { buildFleetSpec, readCatalogSpec } from "./catalog.js";
import { decideFleetProposal, proposeFleetAction } from "./propose.js";
import { measureCockpitSurface } from "./snapshot.js";
import { mountWorkspaceBridge } from "../webmcp/bridge.js";

const mergeAction = "merge-routines:routine-dawn:routine-morning";

describe("fleet catalog and analysis", () => {
  it("rejects an unknown component, bad props, and executable keys", () => {
    const unknown = readCatalogSpec({
      root: "fleet-map",
      elements: [{ id: "fleet-map", type: "Script", props: { title: "no" } }],
    });
    expect(unknown.ok).toBe(false);

    const badProps = readCatalogSpec({
      root: "fleet-map",
      elements: [{ id: "fleet-map", type: "FleetMap", props: { title: "Map", html: "<script>" } }],
    });
    expect(badProps.ok).toBe(false);

    const executable = readCatalogSpec({
      root: "fleet-map",
      elements: [
        {
          id: "fleet-map",
          type: "FleetMap",
          props: { title: "Map", dangerouslySetInnerHTML: { __html: "<script>alert(1)</script>" } },
        },
      ],
    });
    expect(executable.ok).toBe(false);
    if (executable.ok) return;
    expect(executable.message).toContain("dangerouslySetInnerHTML");

    for (const title of ["java\tscript:alert(1)", "javascript&#58;alert(1)", "java&#115;cript:alert(1)"]) {
      const hidden = readCatalogSpec({
        root: "fleet-map",
        elements: [{ id: "fleet-map", type: "FleetMap", props: { title } }],
      });
      expect(hidden.ok, title).toBe(false);
    }

    const handler = readCatalogSpec({
      root: "fleet-map",
      elements: [{ id: "fleet-map", type: "FleetMap", props: { title: "Map", onLoad: "alert(1)" } }],
    });
    expect(handler.ok).toBe(false);
    if (handler.ok) return;
    expect(handler.message).toContain("onLoad");
  });

  it("keeps a catalog valid when the ledger holds more than 100 proposals", () => {
    const state = createSampleWorkspace();
    const findings = analyzeFleet(state.fleetGraph);
    const proposals = Array.from({ length: 120 }, (_, index) => ({
      id: `proposal-${index + 1}`,
      actionId: `mark-dead:edge-${index}`,
      kind: "mark_dead_edge" as const,
      summary: index < 100 ? "Already decided row." : "Still waiting on a person.",
      status: index < 100 ? ("rejected" as const) : ("pending" as const),
      subjectIds: ["edge-stale"],
      createdAt: "2026-11-27T23:00:00.000Z",
    }));
    const spec = buildFleetSpec(state.fleetGraph, findings, proposals);
    const read = readCatalogSpec(spec);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.spec.elements.length).toBeLessThanOrEqual(80);
    const shown = read.spec.elements.filter((element) => element.type === "Proposal");
    expect(shown).toHaveLength(20);
    expect(shown.every((element) => element.type === "Proposal" && element.props.status === "pending")).toBe(true);
    expect(shown.some((element) => element.type === "Proposal" && element.props.summary === "Already decided row.")).toBe(false);

    const crowded = Array.from({ length: 100 }, (_, index) => ({
      id: `proposal-${index + 1}`,
      actionId: `mark-dead:edge-${index}`,
      kind: "mark_dead_edge" as const,
      summary: "Still waiting on a person.",
      status: "pending" as const,
      subjectIds: ["edge-stale"],
      createdAt: "2026-11-27T23:00:00.000Z",
    }));
    const capped = readCatalogSpec(buildFleetSpec(state.fleetGraph, findings, crowded));
    expect(capped.ok).toBe(true);
    if (!capped.ok) return;
    expect(capped.spec.elements.length).toBeLessThanOrEqual(80);
    const ids = capped.spec.elements.flatMap((element) =>
      element.type === "Proposal" ? [element.props.proposalId] : [],
    );
    expect(ids).toContain("proposal-100");
    expect(ids).not.toContain("proposal-1");
  });

  it("renders the sample fleet from a validated catalog and names cycles, hotspots, orphans, and a dead edge", () => {
    const state = createSampleWorkspace();
    const findings = analyzeFleet(state.fleetGraph);
    expect(findings.some((item) => item.code === "cycle" && item.subjectIds.includes("task-classify") && item.subjectIds.includes("task-summarize"))).toBe(true);
    expect(findings).toContainEqual(expect.objectContaining({ code: "fan_in", subjectIds: ["store-ledger"], degree: 3 }));
    expect(findings).toContainEqual(expect.objectContaining({ code: "fan_out", subjectIds: ["bot-router"], degree: 3 }));
    expect(findings.filter((item) => item.code === "orphan").map((item) => item.subjectIds[0]).sort()).toEqual([
      "bot-spare",
      "routine-stale",
    ]);
    expect(findings).toContainEqual(expect.objectContaining({ code: "dead_edge", subjectIds: ["edge-stale"] }));
    const spec = buildFleetSpec(state.fleetGraph, findings, []);
    expect(spec.root).toBe("fleet-map");
    expect(spec.elements.some((element) => element.type === "FleetNode" && element.props.label === "Intake bot")).toBe(true);
    expect(readCatalogSpec(spec).ok).toBe(true);
    const report = measureCockpitSurface(state);
    expect(report.snapshotTokens).toBeLessThan(report.accessibilityTokens);
    expect(report.snapshotTokens).toBeLessThan(report.domTokens);
  });
});

describe("fleet proposals", () => {
  it("files a pending proposal through act and leaves the graph unchanged", () => {
    const state = createSampleWorkspace();
    const graph = JSON.stringify(state.fleetGraph);
    const filed = proposeFleetAction(state, state.stateVersion, mergeAction, "2026-11-27T23:00:00Z");
    expect(filed).toMatchObject({ ok: true });
    if (!("state" in filed)) return;
    expect(filed.state.stateVersion).toBe(state.stateVersion);
    expect(filed.state.autopilot.phase).toBe("idle");
    expect(JSON.stringify(filed.state.fleetGraph)).toBe(graph);
    expect(filed.state.fleetProposals).toEqual([
      expect.objectContaining({ actionId: mergeAction, status: "pending", kind: "merge_routines" }),
    ]);
    const proposalId = filed.state.fleetProposals[0]!.id;
    const duplicate = proposeFleetAction(filed.state, filed.state.stateVersion, mergeAction, "2026-11-27T23:01:00Z");
    expect(duplicate).toMatchObject({ ok: false, code: "DUPLICATE_PROPOSAL", actionId: mergeAction, proposalId });
    const unknown = decideFleetProposal(filed.state, filed.state.stateVersion, "proposal-missing", "approved");
    expect(unknown).toMatchObject({ ok: false, code: "UNKNOWN_PROPOSAL", proposalId: "proposal-missing" });
    const stale = decideFleetProposal(filed.state, filed.state.stateVersion - 1, proposalId, "rejected");
    expect(stale).toMatchObject({ ok: false, error: { code: "STATE_CONFLICT" } });
    const decidedResult = decideFleetProposal(filed.state, filed.state.stateVersion, proposalId, "approved");
    expect(decidedResult.ok).toBe(true);
    if (!decidedResult.ok) return;
    const decided = decidedResult.state;
    expect(decided.logSeq).toBe(filed.state.logSeq + 1);
    expect(decided.eventLog.at(-1)?.message).toContain("approved");
    expect(decided.fleetProposals[0]?.status).toBe("approved");
    expect(JSON.stringify(decided.fleetGraph)).toBe(graph);
    expect(decided.stateVersion).toBe(state.stateVersion);
    const again = decideFleetProposal(decided, decided.stateVersion, proposalId, "rejected");
    expect(again).toMatchObject({ ok: false, code: "ALREADY_DECIDED", proposalId, status: "approved" });
  });

  it("keeps a proposal written while a build tick is awaiting", async () => {
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const router = new BrainRouter({
      prefer: 2,
      tier2: {
        complete: async () => {
          await held;
          return JSON.stringify({
            route: "fleet-map",
            rank: 0.4,
            drift: false,
            reason: "Held for the proposal.",
          });
        },
      },
    });
    const planning = assertCommit(applyPilotEvent(createSampleWorkspace(), 0, { type: "START" }));
    const pending = applyBuildTick(planning, planning.stateVersion, "judge", router);
    const filed = proposeFleetAction(planning, planning.stateVersion, mergeAction, "2026-11-27T23:10:00Z");
    expect(filed).toMatchObject({ ok: true });
    if (!("state" in filed)) return;
    release();
    const tick = await pending;
    expect(tick.ok).toBe(true);
    if (!tick.ok) return;
    expect(tick.state.fleetProposals.some((item) => item.actionId === mergeAction)).toBe(false);
    const merged = mergeAuxIntoTick(filed.state, tick.state);
    expect(merged.autopilot.phase).toBe(tick.state.autopilot.phase);
    expect(merged.stateVersion).toBe(tick.state.stateVersion);
    expect(merged.fleetProposals.some((item) => item.actionId === mergeAction && item.status === "pending")).toBe(true);
  });

  it("keeps an approval that lands while a build tick is awaiting", async () => {
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const router = new BrainRouter({
      prefer: 2,
      tier2: {
        complete: async () => {
          await held;
          return JSON.stringify({
            route: "fleet-map",
            rank: 0.4,
            drift: false,
            reason: "Held for the approval.",
          });
        },
      },
    });
    const filed = proposeFleetAction(createSampleWorkspace(), 0, mergeAction, "2026-11-27T23:10:00Z");
    expect(filed.ok).toBe(true);
    if (!filed.ok) return;
    const planning = assertCommit(applyPilotEvent(filed.state, filed.state.stateVersion, { type: "START" }));
    const pendingTick = applyBuildTick(planning, planning.stateVersion, "judge", router);
    const proposalId = planning.fleetProposals[0]?.id;
    expect(proposalId).toBeTruthy();
    const decided = decideFleetProposal(planning, planning.stateVersion, proposalId ?? "", "approved");
    expect(decided.ok).toBe(true);
    if (!decided.ok) return;
    expect(decided.state.logSeq).toBe(planning.logSeq + 1);
    release();
    const tick = await pendingTick;
    expect(tick.ok).toBe(true);
    if (!tick.ok) return;
    expect(tick.state.fleetProposals[0]?.status).toBe("pending");
    const merged = mergeAuxIntoTick(decided.state, tick.state);
    expect(merged.fleetProposals.find((item) => item.id === proposalId)?.status).toBe("approved");
    expect(merged.fleetGraph).toEqual(tick.state.fleetGraph);
    expect(merged.stateVersion).toBe(tick.state.stateVersion);
    expect(merged.autopilot.phase).toBe(tick.state.autopilot.phase);
    expect(merged.eventLog.some((entry) => entry.message.includes("approved"))).toBe(true);
  });

  it("refuses act until local approval and round-trips snapshot through the bridge", async () => {
    let state = createSampleWorkspace();
    const bridge = await mountWorkspaceBridge({
      globals: {},
      getState: () => state,
      getApproval: () => "read-only",
      onCommit: (result) => {
        if (result.ok) state = result.state;
      },
      getUiSnapshot: () => [{ ref: "c1", component: "button", label: "Build", actions: ["press"] }],
    });
    const shot = await bridge.execute("snapshot", {});
    expect(shot).toMatchObject({ ok: true });
    if (!shot.ok) return;
    const snapshot = shot.snapshot as { actions: Array<{ id: string }>; controls: Array<{ ref: string }> };
    expect(snapshot.actions.map((action) => action.id)).toContain(mergeAction);
    expect(snapshot.controls[0]?.ref).toBe("c1");
    const denied = await bridge.execute("act", { stateVersion: state.stateVersion, actionId: mergeAction });
    expect(denied).toMatchObject({ ok: false, code: "READ_ONLY" });
    expect(state.fleetProposals).toHaveLength(0);
    await bridge.release();

    const approved = await mountWorkspaceBridge({
      globals: {},
      getState: () => state,
      getApproval: () => "local",
      onCommit: (result) => {
        if (result.ok) state = result.state;
      },
    });
    const unknown = await approved.execute("act", { stateVersion: state.stateVersion, actionId: "not-an-action" });
    expect(unknown).toMatchObject({ ok: false, code: "INVALID_INPUT" });
    const acted = await approved.execute("act", { stateVersion: state.stateVersion, actionId: mergeAction });
    expect(acted).toMatchObject({ ok: true, status: "pending" });
    expect(state.fleetProposals[0]?.status).toBe("pending");
    expect(state.stateVersion).toBe(0);
    expect(fleetActionById(state.fleetGraph, mergeAction)?.kind).toBe("merge_routines");
    const firstId = state.fleetProposals[0]?.id ?? "";
    const rejected = decideFleetProposal(state, state.stateVersion, firstId, "rejected");
    expect(rejected.ok).toBe(true);
    if (!rejected.ok) return;
    state = rejected.state;
    const refiled = await approved.execute("act", { stateVersion: state.stateVersion, actionId: mergeAction });
    expect(refiled).toMatchObject({ ok: true, status: "pending" });
    if (!refiled.ok || !("proposalId" in refiled)) return;
    expect(refiled.proposalId).not.toBe(firstId);
    expect(state.fleetProposals.find((item) => item.id === refiled.proposalId)?.status).toBe("pending");
    expect(state.fleetProposals.find((item) => item.id === firstId)?.status).toBe("rejected");
    const duplicate = await approved.execute("act", { stateVersion: state.stateVersion, actionId: mergeAction });
    expect(duplicate).toMatchObject({ ok: false, code: "INVALID_INPUT" });
    expect(state.fleetProposals.filter((item) => item.status === "pending")).toHaveLength(1);
  });
});
