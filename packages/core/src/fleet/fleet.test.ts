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
    const decided = assertCommit(decideFleetProposal(filed.state, filed.state.stateVersion, filed.state.fleetProposals[0]!.id, "approved"));
    expect(decided.fleetProposals[0]?.status).toBe("approved");
    expect(JSON.stringify(decided.fleetGraph)).toBe(graph);
    expect(decided.stateVersion).toBe(state.stateVersion);
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
  });
});
