import { transformSchema } from "@adaptate/core";
import { createActor, isUnhandled, transition } from "xstate";
import { describe, expect, it } from "vitest";
import { createLocalDecisionClient, localModelConfigFromEnv } from "./brain/local-model.js";
import { BrainRouter } from "./brain/router.js";
import {
  chunkText,
  collectParsedSteps,
  collectTrackedSteps,
  readJudgementStream,
  requireDriftNote,
  BrainEventSchema,
} from "./brain/stream.js";
import { applyBuildTick, runSelfBootstrap } from "./bootstrap/run.js";
import { pilotMachine, reducePhase } from "./railway/pilot.js";
import { createSampleWorkspace } from "./state/sample.js";
import {
  StateConflictError,
  applyPilotEvent,
  assertCommit,
  commitHuman,
  commitView,
  pauseRun,
  resumeRun,
} from "./state/store.js";
import { connectorCatalog, createInProcessRunner } from "./tools/delegation.js";
import {
  PilotEventSchema,
  WorkspaceStateSchema,
  pilotPhases,
  type BuildBrief,
  type PilotEvent,
  type PilotPhase,
} from "./state/schema.js";

const router = new BrainRouter({ prefer: 1 });

describe("stateVersion collision guard", () => {
  it("rejects a write that carries a stale stateVersion", () => {
    const seeded = createSampleWorkspace();
    const first = commitHuman(seeded, seeded.stateVersion, (draft) => ({
      ...draft,
      problemCards: draft.problemCards.map((card) =>
        card.id === "card-canvas"
          ? { ...card, statement: `${card.statement} Kept.` }
          : card,
      ),
    }));
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.state.stateVersion).toBe(seeded.stateVersion + 1);

    const stale = commitHuman(first.state, seeded.stateVersion, (draft) => draft);
    expect(stale.ok).toBe(false);
    if (stale.ok) return;
    expect(stale.error).toMatchObject({
      code: "STATE_CONFLICT",
      expectedVersion: 0,
      actualVersion: first.state.stateVersion,
    });
    expect(
      () => assertCommit(stale),
    ).toThrow(StateConflictError);
    expect(first.state.problemCards[0]?.statement.endsWith("Kept.")).toBe(true);
  });
});

describe("human pause override", () => {
  it("pauses an active run and toggles the working banner off", () => {
    let state = createSampleWorkspace();
    state = assertCommit(applyPilotEvent(state, state.stateVersion, { type: "START" }));
    state = assertCommit(
      applyPilotEvent(state, state.stateVersion, { type: "PLAN_READY" }),
    );
    expect(state.autopilot.phase).toBe("running");
    expect(state.autopilot.banner).toBe("working");

    state = assertCommit(
      commitHuman(state, state.stateVersion, (draft) => ({
        ...draft,
        problemCards: draft.problemCards.map((card) =>
          card.id === "card-log"
            ? { ...card, statement: `${card.statement} Human note.` }
            : card,
        ),
      })),
    );

    expect(state.autopilot.phase).toBe("paused_by_human");
    expect(state.autopilot.banner).toBe("paused");
    expect(state.eventLog.at(-1)?.message).toBe("Human edit paused the run");
    expect(state.problemCards.find((card) => card.id === "card-log")?.statement).toContain(
      "Human note.",
    );

    const viewed = assertCommit(commitView(state, state.stateVersion, "code"));
    expect(viewed.mode).toBe("code");
    expect(viewed.autopilot.phase).toBe("paused_by_human");
  });

  it("leaves the phase untouched when the view changes during a run", () => {
    let state = assertCommit(
      applyPilotEvent(createSampleWorkspace(), 0, { type: "START" }),
    );
    state = assertCommit(commitView(state, state.stateVersion, "code"));
    expect(state.autopilot.phase).toBe("planning");
    expect(state.autopilot.banner).toBe("working");
    expect(state.mode).toBe("code");
  });
});

describe("XState pilot railway", () => {
  it("walks idle, planning, running, drift, resume, and completed", () => {
    const actor = createActor(pilotMachine);
    actor.start();
    expect(actor.getSnapshot().value).toBe("idle");
    const trace: PilotEvent[] = [
      { type: "START" },
      { type: "PLAN_READY" },
      { type: "DRIFT" },
      { type: "CLEAR" },
      { type: "PLAN_READY" },
      { type: "COMPLETE" },
    ];
    const seen: string[] = ["idle"];
    for (const event of trace) {
      actor.send(event);
      seen.push(String(actor.getSnapshot().value));
    }
    expect(seen).toEqual([
      "idle",
      "planning",
      "running",
      "drift_detected",
      "resuming",
      "running",
      "completed",
    ]);
    expect(reducePhase(trace)).toBe("completed");
    expect(actor.getSnapshot().status).toBe("done");
    actor.stop();
  });

  it("stops a running actor and ignores later events", () => {
    const actor = createActor(pilotMachine);
    actor.start();
    actor.send({ type: "START" });
    expect(actor.getSnapshot().value).toBe("planning");
    actor.stop();
    const stopped = actor.getSnapshot();
    expect(stopped.status).toBe("stopped");
    expect(stopped.value).toBe("planning");
    const result = transition(pilotMachine, stopped, { type: "PLAN_READY" });
    expect(isUnhandled(stopped, result)).toBe(true);
    expect(result[0].value).toBe("planning");
    expect(result[1]).toEqual([]);
  });

  it("pauses for a person, resumes, and can fail", () => {
    const trace: PilotEvent[] = [
      { type: "START" },
      { type: "PLAN_READY" },
      { type: "HUMAN_PAUSE" },
      { type: "RESUME" },
      { type: "FAIL", reason: "runner unavailable" },
    ];
    expect(reducePhase(trace)).toBe("failed");
    let state = createSampleWorkspace();
    for (const event of trace) {
      state = assertCommit(applyPilotEvent(state, state.stateVersion, event));
    }
    expect(state.autopilot.phase).toBe("failed");
    expect(state.eventLog.filter((entry) => entry.kind === "transition")).toHaveLength(
      trace.length,
    );
    const ignored = pauseRun(state, state.stateVersion);
    expect(ignored.ok).toBe(true);
    if (ignored.ok) expect(ignored.state.autopilot.phase).toBe("failed");
  });

  it("resumes only from the human pause", () => {
    const idle = createSampleWorkspace();
    const resumed = resumeRun(idle, idle.stateVersion);
    expect(resumed.ok).toBe(true);
    if (resumed.ok) expect(resumed.state.autopilot.phase).toBe("idle");
  });
});

describe("3-tier fallback", () => {
  const input = {
    cards: createSampleWorkspace().problemCards,
    mockups: createSampleWorkspace().mockups,
  };

  it("uses frontier text when Tier 3 answers", async () => {
    const brain = new BrainRouter({
      prefer: 3,
      tier3: {
        synthesize: async () =>
          JSON.stringify({
            route: "webmcp-bridge",
            rank: 0.91,
            drift: false,
            reason: "Frontier synthesis kept the bridge.",
          }),
      },
      tier2: {
        complete: async () => {
          throw new Error("should not run");
        },
      },
    });
    const judgement = await brain.judge(input);
    expect(judgement.tier).toBe(3);
    expect(judgement.route).toBe("webmcp-bridge");
  });

  it("falls from Tier 3 to Tier 2 when frontier access drops", async () => {
    const brain = new BrainRouter({
      prefer: 3,
      tier3: {
        synthesize: async () => {
          throw new Error("tokens exhausted");
        },
      },
      tier2: {
        complete: async () =>
          JSON.stringify({
            route: "board-log",
            rank: 0.44,
            drift: false,
            reason: "Local model ranked the log.",
          }),
      },
    });
    const judgement = await brain.judge(input);
    expect(judgement.tier).toBe(2);
    expect(judgement.route).toBe("board-log");
  });

  it("falls through to Tier 1 when local and frontier clients are unreachable", async () => {
    const brain = new BrainRouter({
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
    const judgement = await brain.judge(input);
    expect(judgement.tier).toBe(1);
    expect(judgement.drift).toBe(false);
    expect(judgement.route).toContain("freehand-canvas");
  });

  it("reads the local model through the OpenAI-compatible adapter and degrades offline", async () => {
    const config = localModelConfigFromEnv({});
    expect(config.url).toBe("http://127.0.0.1:11434/v1");
    expect(config.model).toBe("decision");
    const named = localModelConfigFromEnv({
      VISUALIZER_LOCAL_MODEL_URL: "http://127.0.0.1:11434/v1/",
      VISUALIZER_LOCAL_MODEL_NAME: "qwen",
    });
    expect(named).toMatchObject({
      url: "http://127.0.0.1:11434/v1",
      model: "qwen",
    });

    const live = createLocalDecisionClient(named, async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content:
                  '{"route":"freehand-canvas","rank":0.7,"drift":false,"reason":"Held on the local model."}',
              },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const online = new BrainRouter({ prefer: 2, tier2: live });
    expect((await online.judge(input)).tier).toBe(2);

    const offline = createLocalDecisionClient(config, async () => {
      throw new Error("offline");
    });
    const degraded = new BrainRouter({ prefer: 2, tier2: offline });
    expect((await degraded.judge(input)).tier).toBe(1);
  });
});

describe("adaptate streaming pipeline", () => {
  it("validates chunked judgement JSON with parseStream and fromAsyncIterableSteps", async () => {
    const text = JSON.stringify({
      tier: 1,
      route: "freehand-canvas+webmcp-bridge+board-log",
      rank: 1,
      drift: false,
      reason: "Cards, mockups, and schema checks line up.",
    });
    const tracked = await collectTrackedSteps(chunkText(text, 12));
    expect(tracked.length).toBeGreaterThan(1);
    expect(tracked[0]?.openPath).toBeDefined();
    expect(tracked.at(-1)?.complete).toBe(true);
    const judgement = await readJudgementStream(chunkText(`note ${text}`, 9));
    expect(judgement.drift).toBe(false);
    expect(judgement.route).toContain("board-log");
  });

  it("uses conditional and transform helpers on brain events", () => {
    expect(() =>
      requireDriftNote({ kind: "drift", skill: "canvas", score: 0.4 }),
    ).toThrow();
    expect(
      requireDriftNote({
        kind: "drift",
        skill: "canvas",
        score: 0.4,
        note: "The mockup slipped.",
      }).note,
    ).toBe("The mockup slipped.");

    const tightened = transformSchema(BrainEventSchema, { note: true });
    expect(() =>
      tightened.parse({ kind: "step", skill: "canvas", score: 0.2 }),
    ).toThrow();
    expect(
      tightened.parse({
        kind: "step",
        skill: "canvas",
        score: 0.2,
        note: "kept",
      }).note,
    ).toBe("kept");
  });
});

describe("self-bootstrap brief", () => {
  it("emits a verified Step 2 brief from the Tier 1 railway", async () => {
    const result = await runSelfBootstrap(createSampleWorkspace(), router);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.autopilot.phase).toBe("completed");
    expect(result.state.autopilot.banner).toBe("hidden");
    expect(result.state.brief?.verified).toBe(true);
    expect(result.state.brief?.title).toBe("Visualizer Step 2");
    expect(result.state.brief?.problems.map((problem) => problem.id)).toEqual([
      "card-canvas",
      "card-bridge",
      "card-log",
    ]);
    expect(result.state.brief?.connectors).toEqual([
      "github",
      "vercel",
      "greenhouse",
      "workspace",
      "ashby",
    ]);
    expect(result.state.brief?.runnerSummary).toContain("Cursor accepted");
    expect(result.state.eventLog.some((entry) => entry.kind === "transition")).toBe(true);
  });

  it("stops on drift and on a human pause hook", async () => {
    const drifting = new BrainRouter({
      prefer: 1,
      tier1: () => ({
        tier: 1,
        route: "schema-check",
        rank: 0.1,
        drift: true,
        reason: "A problem card has no mockup anchor.",
      }),
    });
    const drifted = await runSelfBootstrap(createSampleWorkspace(), drifting);
    expect(drifted.ok).toBe(true);
    if (!drifted.ok) return;
    expect(drifted.state.autopilot.phase).toBe("drift_detected");
    expect(drifted.state.brief).toBeNull();

    const paused = await runSelfBootstrap(createSampleWorkspace(), router, {
      beforeTick: (tick) => (tick === "engage" ? "pause" : "go"),
    });
    expect(paused.ok).toBe(true);
    if (!paused.ok) return;
    expect(paused.state.autopilot.phase).toBe("paused_by_human");
    expect(paused.state.autopilot.banner).toBe("paused");
  });

  it("rejects a stale build tick", async () => {
    const seeded = createSampleWorkspace();
    const started = assertCommit(
      await applyBuildTick(seeded, seeded.stateVersion, "start", router),
    );
    const stale = await applyBuildTick(started, seeded.stateVersion, "judge", router);
    expect(stale.ok).toBe(false);
    if (stale.ok) return;
    expect(stale.error.code).toBe("STATE_CONFLICT");
  });
});

describe("illegal railway events", () => {
  const events: PilotEvent[] = [
    { type: "START" },
    { type: "PLAN_READY" },
    { type: "DRIFT" },
    { type: "CLEAR" },
    { type: "HUMAN_PAUSE" },
    { type: "RESUME" },
    { type: "COMPLETE" },
    { type: "FAIL", reason: "runner unavailable" },
  ];

  function at(phase: PilotPhase) {
    const traces: Record<PilotPhase, PilotEvent[]> = {
      idle: [],
      planning: [{ type: "START" }],
      running: [{ type: "START" }, { type: "PLAN_READY" }],
      drift_detected: [{ type: "START" }, { type: "PLAN_READY" }, { type: "DRIFT" }],
      paused_by_human: [{ type: "START" }, { type: "HUMAN_PAUSE" }],
      resuming: [{ type: "START" }, { type: "HUMAN_PAUSE" }, { type: "RESUME" }],
      completed: [{ type: "START" }, { type: "PLAN_READY" }, { type: "COMPLETE" }],
      failed: [{ type: "START" }, { type: "FAIL", reason: "runner unavailable" }],
    };
    let state = createSampleWorkspace();
    for (const event of traces[phase]) {
      state = assertCommit(applyPilotEvent(state, state.stateVersion, event));
    }
    return state;
  }

  it("rejects every event that the railway does not enable", () => {
    const enabled: Record<PilotPhase, ReadonlySet<PilotEvent["type"]>> = {
      idle: new Set(["START"]),
      planning: new Set(["PLAN_READY", "HUMAN_PAUSE", "FAIL"]),
      running: new Set(["DRIFT", "HUMAN_PAUSE", "COMPLETE", "FAIL"]),
      drift_detected: new Set(["CLEAR", "HUMAN_PAUSE", "FAIL"]),
      paused_by_human: new Set(["RESUME"]),
      resuming: new Set(["PLAN_READY", "COMPLETE", "HUMAN_PAUSE", "FAIL"]),
      completed: new Set(),
      failed: new Set(),
    };
    for (const phase of pilotPhases) {
      const state = at(phase);
      expect(state.autopilot.phase).toBe(phase);
      for (const event of events) {
        const result = applyPilotEvent(state, state.stateVersion, event);
        if (enabled[phase].has(event.type)) {
          expect(result.ok, `${phase} ${event.type}`).toBe(true);
        } else {
          expect(result.ok, `${phase} ${event.type}`).toBe(false);
          if (!result.ok) {
            expect(result.error).toMatchObject({
              code: "ILLEGAL_TRANSITION",
              from: phase,
              event: event.type,
            });
          }
          expect(state.stateVersion).toBe(at(phase).stateVersion);
          expect(state.autopilot.phase).toBe(phase);
        }
      }
    }
  });

  it("rejects a pilot event that fails the zod contract", () => {
    expect(PilotEventSchema.safeParse({ type: "FAIL" }).success).toBe(false);
    expect(PilotEventSchema.safeParse({ type: "OTHER" }).success).toBe(false);
    const extra = PilotEventSchema.safeParse({ type: "START", reason: "no" });
    expect(extra.success).toBe(true);
    if (extra.success) expect(extra.data).toEqual({ type: "START" });
  });
});

describe("workspace schema and concurrent writers", () => {
  it("rejects an empty statement, a negative version, and an unknown phase", () => {
    const seeded = createSampleWorkspace();
    expect(
      WorkspaceStateSchema.safeParse({
        ...seeded,
        problemCards: [{ ...seeded.problemCards[0], statement: "" }],
      }).success,
    ).toBe(false);
    expect(WorkspaceStateSchema.safeParse({ ...seeded, stateVersion: -1 }).success).toBe(false);
    expect(
      WorkspaceStateSchema.safeParse({
        ...seeded,
        autopilot: { ...seeded.autopilot, phase: "sleeping" },
      }).success,
    ).toBe(false);
  });

  it("keeps versions strictly increasing and drops the stale writer", () => {
    const base = createSampleWorkspace();
    const versions = [base.stateVersion];
    let state = base;
    const steps: PilotEvent[] = [
      { type: "START" },
      { type: "PLAN_READY" },
      { type: "HUMAN_PAUSE" },
      { type: "RESUME" },
    ];
    for (const event of steps) {
      state = assertCommit(applyPilotEvent(state, state.stateVersion, event));
      versions.push(state.stateVersion);
    }
    expect(versions).toEqual([0, 1, 2, 3, 4]);
    const human = assertCommit(
      commitHuman(base, base.stateVersion, (draft) => ({
        ...draft,
        problemCards: draft.problemCards.map((card) =>
          card.id === "card-canvas"
            ? { ...card, statement: `${card.statement} Human kept.` }
            : card,
        ),
      })),
    );
    const agent = applyPilotEvent(human, base.stateVersion, { type: "START" });
    expect(agent.ok).toBe(false);
    expect(human.problemCards[0]?.statement).toContain("Human kept.");
    expect(human.stateVersion).toBe(1);
    const viewed = assertCommit(commitView(human, human.stateVersion, "code"));
    expect(viewed.mode).toBe("code");
    expect(viewed.problemCards[0]?.statement).toBe(human.problemCards[0]?.statement);
    expect(viewed.stateVersion).toBe(human.stateVersion + 1);
  });
});

describe("judgement stream edges", () => {
  it("rejects a malformed chunk and a partial frame", async () => {
    await expect(readJudgementStream(chunkText("<<<not-json", 3))).rejects.toThrow(
      /JSON object/,
    );
    await expect(
      readJudgementStream(chunkText('{"route":"freehand-canvas","rank":0.2', 7)),
    ).rejects.toThrow(/JSON object/);
    const partial = await collectParsedSteps(
      chunkText('{"route":"freehand-canvas"', 4),
      BrainEventSchema,
    );
    expect(partial.some((step) => step.done && step.result.ok)).toBe(false);
  });

  it("stops when the source aborts", async () => {
    async function* aborted(): AsyncGenerator<string> {
      yield '{"route":';
      throw new DOMException("The operation was aborted.", "AbortError");
    }
    await expect(readJudgementStream(aborted())).rejects.toThrow(/aborted/i);
  });
});

describe("shared store across modes", () => {
  it("shows one statement and one version after a cockpit edit and a code view", () => {
    const cockpit = createSampleWorkspace();
    const edited = assertCommit(
      commitHuman(cockpit, cockpit.stateVersion, (draft) => ({
        ...draft,
        problemCards: draft.problemCards.map((card) =>
          card.id === "card-canvas"
            ? { ...card, statement: "Pinned stroke from the cockpit." }
            : card,
        ),
      })),
    );
    const code = assertCommit(commitView(edited, edited.stateVersion, "code"));
    expect(code.mode).toBe("code");
    expect(code.stateVersion).toBe(edited.stateVersion + 1);
    expect(code.problemCards.find((card) => card.id === "card-canvas")?.statement).toBe(
      "Pinned stroke from the cockpit.",
    );
    expect(code.autopilot).toEqual(edited.autopilot);
  });
});

describe("tool delegation contract", () => {
  it("publishes connector schemas and declines an unverified brief", async () => {
    const catalog = connectorCatalog();
    expect(catalog.map((item) => item.id)).toEqual([
      "github",
      "vercel",
      "greenhouse",
      "workspace",
      "ashby",
    ]);
    expect(catalog[0]?.inputSchema).toMatchObject({ type: "object" });

    const brief: BuildBrief = {
      title: "Visualizer Step 2",
      verified: false,
      problems: [],
      route: "schema-check",
      tier: 1,
      tools: ["codex"],
      connectors: ["github"],
      steps: ["Hold."],
      runnerSummary: "pending",
    };
    const declined = await createInProcessRunner("codex").handoff({ brief });
    expect(declined.accepted).toBe(false);
    expect(declined.summary).toContain("Codex");
  });
});
