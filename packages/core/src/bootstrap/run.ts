import { BrainRouter, type BrainInput } from "../brain/router.js";
import {
  applyPilotEvent,
  pauseRun,
  type CommitResult,
} from "../state/store.js";
import {
  BuildBriefSchema,
  WorkspaceStateSchema,
  type BuildCursor,
  type WorkspaceState,
} from "../state/schema.js";
import { connectorCatalog, createInProcessRunner } from "../tools/delegation.js";

export const buildTickOrder = ["start", "judge", "engage", "finish"] as const;
export type BuildTick = (typeof buildTickOrder)[number];

export function remainingTicks(cursor: BuildCursor): BuildTick[] {
  if (cursor === "done") return [];
  const index = buildTickOrder.indexOf(cursor);
  if (index === -1) return [];
  return buildTickOrder.slice(index);
}

function brainInput(state: WorkspaceState): BrainInput {
  return {
    cards: state.problemCards.map((card) => ({
      title: card.title,
      statement: card.statement,
    })),
    mockups: state.mockups.map((mockup) => ({ title: mockup.title })),
  };
}

function withCursor(state: WorkspaceState, cursor: BuildCursor): WorkspaceState {
  return {
    ...state,
    autopilot: { ...state.autopilot, cursor },
  };
}

export async function applyBuildTick(
  state: WorkspaceState,
  expectedVersion: number,
  tick: BuildTick,
  router: BrainRouter,
): Promise<CommitResult> {
  if (expectedVersion !== state.stateVersion) {
    return {
      ok: false,
      error: {
        code: "STATE_CONFLICT",
        expectedVersion,
        actualVersion: state.stateVersion,
      },
    };
  }
  if (state.autopilot.phase === "paused_by_human") return { ok: true, state };
  if (state.autopilot.cursor === "done") return { ok: true, state };

  if (tick === "start") {
    if (state.autopilot.phase === "resuming") {
      return { ok: true, state: withCursor(state, "judge") };
    }
    if (state.autopilot.phase !== "idle") return { ok: true, state };
    return applyPilotEvent(state, expectedVersion, { type: "START" }, (next) =>
      withCursor(next, "judge"),
    );
  }

  if (tick === "judge") {
    if (state.autopilot.phase !== "planning" && state.autopilot.phase !== "resuming") {
      return { ok: true, state };
    }
    const judgement = await router.judge(brainInput(state));
    const stateVersion = state.stateVersion + 1;
    const logSeq = state.logSeq + 1;
    return {
      ok: true,
      state: WorkspaceStateSchema.parse({
        ...state,
        stateVersion,
        logSeq,
        autopilot: { ...state.autopilot, judgement, cursor: "engage" },
        eventLog: [
          ...state.eventLog,
          {
            id: `log-${logSeq}`,
            stateVersion,
            kind: "judgement",
            message: `Tier ${judgement.tier} routed ${judgement.route}`,
          },
        ],
      }),
    };
  }

  if (tick === "engage") {
    if (state.autopilot.phase !== "planning" && state.autopilot.phase !== "resuming") {
      return { ok: true, state };
    }
    return applyPilotEvent(state, expectedVersion, { type: "PLAN_READY" }, (next) =>
      withCursor(next, "finish"),
    );
  }

  const judgement = state.autopilot.judgement;
  if (!judgement) {
    return applyPilotEvent(state, expectedVersion, {
      type: "FAIL",
      reason: "missing-judgement",
    });
  }
  if (judgement.drift || state.autopilot.phase === "drift_detected") {
    let current = state;
    if (current.autopilot.phase === "resuming") {
      const stepped = applyPilotEvent(current, current.stateVersion, { type: "PLAN_READY" });
      if (!stepped.ok) return stepped;
      current = stepped.state;
    }
    if (current.autopilot.phase === "running") {
      return applyPilotEvent(
        current,
        current.stateVersion,
        { type: "DRIFT" },
        (next) => withCursor(next, "finish"),
      );
    }
    return { ok: true, state: current };
  }

  const runner = createInProcessRunner("cursor");
  const draft = BuildBriefSchema.parse({
    title: "Visualizer Step 2",
    verified: true,
    problems: state.problemCards.map((card) => ({
      id: card.id,
      title: card.title,
      acceptance: card.acceptance,
    })),
    route: judgement.route,
    tier: judgement.tier,
    tools: ["cursor", "claude-code", "codex"],
    connectors: connectorCatalog().map((connector) => connector.id),
    steps: [
      "Publish freehand canvas strokes onto problem cards.",
      "Bridge workspace state through document.modelContext.",
      "Append the event log to a local @vercel/board SQLite file.",
    ],
    runnerSummary: "pending",
  });
  const handed = await runner.handoff({ brief: draft });
  if (!handed.accepted) {
    return applyPilotEvent(state, expectedVersion, {
      type: "FAIL",
      reason: "handoff-declined",
    });
  }
  const brief = { ...draft, runnerSummary: handed.summary };
  const phase = state.autopilot.phase;
  const event =
    phase === "resuming" || phase === "running"
      ? ({ type: "COMPLETE" } as const)
      : null;
  if (!event) {
    return applyPilotEvent(state, expectedVersion, {
      type: "FAIL",
      reason: `cannot-complete-from-${phase}`,
    });
  }
  return applyPilotEvent(
    state,
    expectedVersion,
    event,
    (next) => ({
      ...withCursor(next, "done"),
      brief,
    }),
    `Step 2 brief verified on ${judgement.route}`,
  );
}

export async function runSelfBootstrap(
  state: WorkspaceState,
  router: BrainRouter = new BrainRouter({ prefer: 1 }),
  hooks?: {
    beforeTick?: (tick: BuildTick, state: WorkspaceState) => "pause" | "go";
  },
): Promise<CommitResult> {
  let current = state;
  while (
    current.autopilot.cursor !== "done" &&
    current.autopilot.phase !== "paused_by_human" &&
    current.autopilot.phase !== "failed" &&
    current.autopilot.phase !== "drift_detected"
  ) {
    const tick = current.autopilot.cursor;
    if (hooks?.beforeTick?.(tick, current) === "pause") {
      return pauseRun(current, current.stateVersion);
    }
    const result = await applyBuildTick(current, current.stateVersion, tick, router);
    if (!result.ok) return result;
    current = result.state;
  }
  return { ok: true, state: current };
}
