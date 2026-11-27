import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BrainRouter } from "./brain/router.js";
import { applyBuildTick, runSelfBootstrap } from "./bootstrap/run.js";
import { checkLockstep } from "./formal/lockstep.js";
import { appendEnsemblyRecord, promoteEnsemblyRecord, recordWorkflowLesson } from "./memory/commit.js";
import { canvasCardId, createSampleWorkspace } from "./state/sample.js";
import { readPersistedWorkspace, serializeWorkspace } from "./state/persist.js";
import { appendSketchStroke } from "./state/strokes.js";
import { mountWorkspaceBridge } from "./webmcp/bridge.js";
import { createLocalModelContext } from "./webmcp/model-context.js";
import {
  applyPilotEvent,
  assertCommit,
  commitHuman,
  commitView,
  pauseRun,
} from "./state/store.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

describe("critical flows", () => {
  it("CF-01 edits a problem card in the cockpit and reads it from code mode", () => {
    const cockpit = createSampleWorkspace();
    expect(cockpit.mode).toBe("cockpit");
    const edited = assertCommit(
      commitHuman(cockpit, cockpit.stateVersion, (draft) => ({
        ...draft,
        problemCards: draft.problemCards.map((card) =>
          card.id === "card-canvas"
            ? { ...card, statement: "Cockpit stroke stays on the card." }
            : card,
        ),
      })),
    );
    const code = assertCommit(commitView(edited, edited.stateVersion, "code"));
    expect(code.mode).toBe("code");
    expect(code.stateVersion).toBe(cockpit.stateVersion + 2);
    expect(code.problemCards.find((card) => card.id === "card-canvas")?.statement).toBe(
      "Cockpit stroke stays on the card.",
    );
    expect(code.eventLog.at(-1)?.message).toBe("Opened Code Mode");
  });

  it("CF-02 pauses a live build when a person edits and keeps the edit", async () => {
    const router = new BrainRouter({ prefer: 1 });
    let state = createSampleWorkspace();
    state = assertCommit(await applyBuildTick(state, state.stateVersion, "start", router));
    expect(state.autopilot.phase).toBe("planning");
    expect(state.autopilot.banner).toBe("working");
    const statement = "Human edit during planning stays put.";
    state = assertCommit(
      commitHuman(state, state.stateVersion, (draft) => ({
        ...draft,
        problemCards: draft.problemCards.map((card) =>
          card.id === "card-bridge" ? { ...card, statement } : card,
        ),
      })),
    );
    expect(state.autopilot.phase).toBe("paused_by_human");
    expect(state.autopilot.banner).toBe("paused");
    const agent = await applyBuildTick(state, state.stateVersion, "judge", router);
    expect(agent.ok).toBe(true);
    if (!agent.ok) return;
    expect(agent.state.stateVersion).toBe(state.stateVersion);
    expect(agent.state.problemCards.find((card) => card.id === "card-bridge")?.statement).toBe(
      statement,
    );
    expect(agent.state.autopilot.phase).toBe("paused_by_human");
  });

  it("CF-03 falls from the frontier to the local model and then to deterministic code", async () => {
    const input = {
      cards: createSampleWorkspace().problemCards,
      mockups: createSampleWorkspace().mockups,
    };
    const frontierDown = new BrainRouter({
      prefer: 3,
      tier3: {
        synthesize: async () => {
          throw new Error("access dropped");
        },
      },
      tier2: {
        complete: async () =>
          JSON.stringify({
            route: "board-log",
            rank: 0.4,
            drift: false,
            reason: "Local model answered.",
          }),
      },
    });
    expect((await frontierDown.judge(input)).tier).toBe(2);

    const bothDown = new BrainRouter({
      prefer: 3,
      tier3: {
        synthesize: async () => {
          throw new Error("access dropped");
        },
      },
      tier2: {
        complete: async () => {
          throw new Error("connection refused");
        },
      },
    });
    const offline = await bothDown.judge(input);
    expect(offline.tier).toBe(1);
    expect(offline.drift).toBe(false);

    const built = await runSelfBootstrap(createSampleWorkspace(), new BrainRouter({ prefer: 1 }));
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.state.autopilot.phase).toBe("completed");
    expect(built.state.brief?.verified).toBe(true);
  });

  it("CF-04 runs the local-model harness without requiring a live server", async () => {
    const report = await new Promise<{ code: number; stdout: string }>((resolve, reject) => {
      const child = spawn("pnpm", ["test:local-model"], {
        cwd: repoRoot,
        env: { ...process.env, VISUALIZER_LOCAL_MODEL_STRICT: "" },
      });
      let stdout = "";
      let stderr = "";
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk: string) => {
        stderr += chunk;
      });
      child.on("error", reject);
      child.on("close", (code) => resolve({ code: code ?? 1, stdout: `${stdout}\n${stderr}` }));
    });
    expect(report.code).toBe(0);
    const jsonStart = report.stdout.indexOf("{");
    expect(jsonStart).toBeGreaterThanOrEqual(0);
    const parsed = JSON.parse(report.stdout.slice(jsonStart)) as {
      tier: number;
      fellBackToTier1: boolean;
      route: string;
    };
    expect(parsed.route.length).toBeGreaterThan(0);
    expect(parsed.tier === 2 || parsed.fellBackToTier1).toBe(true);
  }, 20000);

  it("CF-05 stops a run and ignores a later agent tick", async () => {
    const router = new BrainRouter({ prefer: 1 });
    let state = assertCommit(
      applyPilotEvent(createSampleWorkspace(), 0, { type: "START" }),
    );
    state = assertCommit(pauseRun(state, state.stateVersion));
    expect(state.autopilot.phase).toBe("paused_by_human");
    const stopped = await applyBuildTick(state, state.stateVersion, "judge", router);
    expect(stopped.ok).toBe(true);
    if (!stopped.ok) return;
    expect(stopped.state).toBe(state);
  });

  it("CF-06 pins a stroke to its card, reloads it, and keeps it when a draw pauses the build", async () => {
    const router = new BrainRouter({ prefer: 1 });
    let state = createSampleWorkspace();
    const points = [
      { x: 0.15, y: 0.3 },
      { x: 0.62, y: 0.48 },
      { x: 0.4, y: 0.8 },
    ];
    state = assertCommit(
      appendSketchStroke(state, state.stateVersion, { cardId: canvasCardId, points }),
    );
    expect(state.strokes).toHaveLength(1);
    expect(state.strokes[0]?.cardId).toBe(canvasCardId);
    expect(state.autopilot.phase).toBe("idle");
    const reloaded = readPersistedWorkspace(serializeWorkspace(state));
    expect(reloaded?.strokes[0]?.points).toEqual(points);
    state = assertCommit(commitView(reloaded ?? state, (reloaded ?? state).stateVersion, "code"));
    expect(state.mode).toBe("code");
    expect(state.strokes[0]?.id).toBe("stroke-2");
    state = createSampleWorkspace();
    state = assertCommit(await applyBuildTick(state, state.stateVersion, "start", router));
    expect(state.autopilot.phase).toBe("planning");
    state = assertCommit(
      appendSketchStroke(state, state.stateVersion, { cardId: canvasCardId, points }),
    );
    expect(state.autopilot.phase).toBe("paused_by_human");
    expect(state.autopilot.banner).toBe("paused");
    expect(state.strokes).toHaveLength(1);
    const later = await applyBuildTick(state, state.stateVersion, "judge", router);
    expect(later.ok).toBe(true);
    if (!later.ok) return;
    expect(later.state).toBe(state);
    expect(later.state.strokes[0]?.points).toEqual(points);
  });

  it("CF-07 promotes a confirmed Ensembly record and keeps a workflow lesson across code mode", () => {
    let state = createSampleWorkspace();
    const legacy = { ...state } as Record<string, unknown>;
    delete legacy.ensemblyLedger;
    delete legacy.pulseMemory;
    delete legacy.workflowLessons;
    const hydrated = readPersistedWorkspace(JSON.stringify(legacy));
    expect(hydrated?.pulseMemory).toEqual([]);
    expect(hydrated?.problemCards).toHaveLength(state.problemCards.length);
    state = hydrated ?? state;
    state = assertCommit(
      appendEnsemblyRecord(state, state.stateVersion, {
        id: "ens-cf07-rule",
        timestamp: "2026-11-27T18:00:00Z",
        kind: "rule",
        summary: "Promote only after the outcome is confirmed.",
        rationale: "An open decision is still a ledger line.",
        provenance: "docs/CRITICAL-FLOWS.md",
        confirmedOutcome: null,
      }),
    );
    expect(state.pulseMemory).toEqual([]);
    const unconfirmed = promoteEnsemblyRecord(state, state.stateVersion, "ens-cf07-rule");
    expect(unconfirmed.ok).toBe(true);
    if (!unconfirmed.ok) return;
    expect(unconfirmed.state.stateVersion).toBe(state.stateVersion);
    state = assertCommit(
      appendEnsemblyRecord(state, state.stateVersion, {
        id: "ens-cf07-mistake",
        timestamp: "2026-11-27T18:00:01Z",
        kind: "costly_mistake",
        summary: "A confirmed mistake belongs in Pulse Memory.",
        rationale: "The next run should avoid the same rework.",
        provenance: "docs/CRITICAL-FLOWS.md",
        confirmedOutcome: "The cockpit and Code Mode both list the mistake.",
      }),
    );
    state = assertCommit(
      recordWorkflowLesson(state, state.stateVersion, {
        id: "lesson-cf07",
        recordedAt: "2026-11-27T18:00:02Z",
        phase: state.autopilot.phase,
        cardId: "card-log",
        signal: "adjustment",
        lesson: "Record the lesson on the card that caused the rework.",
        adjustment: "Keep the lesson when the view changes.",
      }),
    );
    const stale = appendEnsemblyRecord(state, 0, {
      id: "ens-cf07-stale",
      timestamp: "2026-11-27T18:00:03Z",
      kind: "decision",
      summary: "A stale write must not append.",
      rationale: "stateVersion is the lock.",
      provenance: "docs/CRITICAL-FLOWS.md",
      confirmedOutcome: "Rejected.",
    });
    expect(stale.ok).toBe(false);
    const code = assertCommit(commitView(state, state.stateVersion, "code"));
    expect(code.mode).toBe("code");
    expect(code.autopilot.phase).toBe("idle");
    expect(code.pulseMemory.map((pulse) => pulse.id)).toEqual(["ens-cf07-mistake"]);
    expect(code.workflowLessons.find((lesson) => lesson.id === "lesson-cf07")?.cardId).toBe("card-log");
    const stored = readPersistedWorkspace(serializeWorkspace(code));
    expect(stored?.pulseMemory[0]?.summary).toBe("A confirmed mistake belongs in Pulse Memory.");
    expect(stored?.ensemblyLedger.map((record) => record.id)).toEqual(["ens-cf07-rule", "ens-cf07-mistake"]);
  });

  it("CF-07 records a workflow lesson during a working phase without pausing", () => {
    let state = assertCommit(applyPilotEvent(createSampleWorkspace(), 0, { type: "START" }));
    state = assertCommit(applyPilotEvent(state, state.stateVersion, { type: "PLAN_READY" }));
    const version = state.stateVersion;
    state = assertCommit(
      recordWorkflowLesson(state, state.stateVersion, {
        id: "lesson-cf07-running",
        recordedAt: "2026-11-27T18:05:00Z",
        phase: "running",
        cardId: "card-canvas",
        signal: "friction",
        lesson: "Record the lesson while the railway is running.",
        adjustment: "Keep the working phase.",
      }),
    );
    expect(state.autopilot.phase).toBe("running");
    expect(state.stateVersion).toBe(version);
    expect(state.workflowLessons.some((lesson) => lesson.id === "lesson-cf07-running")).toBe(true);
    const stored = readPersistedWorkspace(serializeWorkspace(state));
    expect(stored?.autopilot.phase).toBe("running");
    expect(stored?.workflowLessons.some((lesson) => lesson.id === "lesson-cf07-running")).toBe(true);
  });

  it("CF-08 registers WebMCP tools, rejects a stale Ensembly write, and clears them on release", async () => {
    const absent = await mountWorkspaceBridge({
      globals: {},
      getState: createSampleWorkspace,
      getApproval: () => "read-only",
      onCommit: () => undefined,
    });
    expect(absent.source).toBe("local");
    const listed = await absent.execute("list_cards", {});
    expect(listed).toMatchObject({ ok: true });
    await absent.release();
    expect(await absent.execute("read_pulse_memory", {})).toMatchObject({
      ok: false,
      code: "UNREGISTERED",
    });

    const host = createLocalModelContext();
    let state = assertCommit(applyPilotEvent(createSampleWorkspace(), 0, { type: "START" }));
    const bridge = await mountWorkspaceBridge({
      globals: { document: { modelContext: host } },
      getState: () => state,
      getApproval: () => "local",
      onCommit: (result) => {
        if (result.ok) state = result.state;
      },
    });
    expect(host.listNames()).toContain("append_ensembly_record");
    const stale = await bridge.execute("append_ensembly_record", {
      stateVersion: 0,
      id: "ens-cf08",
      timestamp: "2026-11-27T12:00:00Z",
      kind: "decision",
      summary: "Stale append",
      rationale: "The version moved.",
      provenance: "packages/core/src/critical-flows.test.ts",
      confirmedOutcome: null,
    });
    expect(stale).toMatchObject({ ok: false, code: "STATE_CONFLICT" });
    expect(state.ensemblyLedger.some((record) => record.id === "ens-cf08")).toBe(false);
    await bridge.release();
    expect(host.listNames()).toHaveLength(0);
  });

  it("holds the lockstep properties on the real transition functions", async () => {
    const report = await checkLockstep();
    expect(report.ok, report.ok ? "" : `${report.property}: ${report.detail}`).toBe(true);
  });
});
