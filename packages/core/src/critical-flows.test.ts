import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BrainRouter } from "./brain/router.js";
import { applyBuildTick, runSelfBootstrap } from "./bootstrap/run.js";
import { checkLockstep } from "./formal/lockstep.js";
import { canvasCardId, createSampleWorkspace } from "./state/sample.js";
import { readPersistedWorkspace, serializeWorkspace } from "./state/persist.js";
import { appendSketchStroke } from "./state/strokes.js";
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

  it("holds the lockstep properties on the real transition functions", async () => {
    const report = await checkLockstep();
    expect(report.ok, report.ok ? "" : `${report.property}: ${report.detail}`).toBe(true);
  });
});
