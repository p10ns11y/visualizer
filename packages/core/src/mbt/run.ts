import { getSimplePaths } from "xstate/graph";
import { BrainRouter } from "../brain/router.js";
import { applyBuildTick } from "../bootstrap/run.js";
import { pilotMachine } from "../railway/pilot.js";
import { canvasCardId, createSampleWorkspace } from "../state/sample.js";
import {
  BuildBriefSchema,
  WorkspaceStateSchema,
  pilotPhases,
  type PilotEvent,
  type PilotPhase,
  type WorkspaceState,
} from "../state/schema.js";
import { appendSketchStroke } from "../state/strokes.js";
import { applyPilotEvent, commitView } from "../state/store.js";
import { createInProcessRunner, connectorIds } from "../tools/delegation.js";
import {
  executeStreamedConnectorCall,
  pacedChunks,
} from "../tools/adapt-call.js";

const router = new BrainRouter({ prefer: 1 });

export type MbtReport =
  | {
      ok: true;
      paths: number;
      steps: number;
      phases: PilotPhase[];
    }
  | {
      ok: false;
      path: number;
      step: number;
      detail: string;
    };

function phaseOf(value: unknown): PilotPhase | undefined {
  return pilotPhases.find((phase) => phase === value);
}

function isPilotEvent(event: { type: string }): event is PilotEvent {
  if (event.type === "FAIL") return "reason" in event && typeof event.reason === "string";
  return (
    event.type === "START" ||
    event.type === "PLAN_READY" ||
    event.type === "DRIFT" ||
    event.type === "CLEAR" ||
    event.type === "HUMAN_PAUSE" ||
    event.type === "RESUME" ||
    event.type === "COMPLETE"
  );
}

async function assertToolCalls(state: WorkspaceState): Promise<string | null> {
  const before = WorkspaceStateSchema.parse(state);
  for (const connectorId of connectorIds) {
    const payload = JSON.stringify({
      connectorId,
      workspaceVersion: state.stateVersion,
      summary: `${connectorId} at v${state.stateVersion}`,
    });
    const outcome = await executeStreamedConnectorCall(pacedChunks(payload, 11), state.stateVersion);
    if (!outcome.ok) return `${connectorId} rejected a current call`;
    if (outcome.tool.length === 0 || outcome.bytes === 0) return `${connectorId} returned an empty result`;
  }
  const staleVersion = state.stateVersion === 0 ? 1 : state.stateVersion - 1;
  const stale = await executeStreamedConnectorCall(
    pacedChunks(
      JSON.stringify({
        connectorId: "github",
        workspaceVersion: staleVersion,
        summary: "stale tool call",
      }),
      9,
    ),
    state.stateVersion,
  );
  if (stale.ok || stale.code !== "STATE_CONFLICT") return "stale tool call was accepted";
  const partial = await executeStreamedConnectorCall(
    pacedChunks('{"connectorId":"github","workspaceVersion":', 8),
    state.stateVersion,
  );
  if (partial.ok || partial.code !== "INVALID_CALL") return "partial tool call was accepted";
  async function* aborted(): AsyncGenerator<string> {
    yield '{"connectorId":"vercel"';
    throw new DOMException("The operation was aborted.", "AbortError");
  }
  const stopped = await executeStreamedConnectorCall(aborted(), state.stateVersion);
  if (stopped.ok || stopped.code !== "INVALID_CALL") return "aborted tool call was accepted";
  if (JSON.stringify(state) !== JSON.stringify(before)) return "tool calls mutated the workspace";

  const brief = BuildBriefSchema.parse({
    title: "Visualizer Step 2",
    verified: state.autopilot.phase === "completed",
    problems: state.problemCards.map((card) => ({
      id: card.id,
      title: card.title,
      acceptance: card.acceptance,
    })),
    route: state.autopilot.judgement?.route ?? "pilot",
    tier: 1,
    tools: ["cursor"],
    connectors: [...connectorIds],
    steps: ["Hold the shared workspace."],
    runnerSummary: "pending",
  });
  const handed = await createInProcessRunner("cursor").handoff({ brief });
  if (state.autopilot.phase === "completed" && !handed.accepted) {
    return "completed path declined a verified handoff";
  }
  if (state.autopilot.phase !== "completed" && handed.accepted) {
    return "unfinished path accepted a handoff";
  }
  return null;
}

async function assertInvariants(state: WorkspaceState): Promise<string | null> {
  if (state.stateVersion < 0) return "stateVersion decreased";
  const parsed = WorkspaceStateSchema.safeParse(state);
  if (!parsed.success) return "workspace failed schema validation";
  const other = state.mode === "cockpit" ? "code" : "cockpit";
  const viewed = commitView(state, state.stateVersion, other);
  if (!viewed.ok) return "view switch was rejected";
  if (viewed.state.problemCards.some((card, index) => card.statement !== state.problemCards[index]?.statement)) {
    return "view switch changed a problem statement";
  }
  if (viewed.state.autopilot.phase !== state.autopilot.phase) return "view switch changed the railway";
  if (viewed.state.stateVersion !== state.stateVersion + 1) return "view switch did not raise stateVersion";
  if (viewed.state.strokes.length !== state.strokes.length) return "view switch dropped a stroke";
  if (viewed.state.pulseMemory.length !== state.pulseMemory.length) return "view switch dropped pulse memory";
  if (viewed.state.workflowLessons.length !== state.workflowLessons.length) {
    return "view switch dropped a workflow lesson";
  }
  if (state.autopilot.phase === "planning" && state.strokes.length === 0) {
    const drawn = appendSketchStroke(state, state.stateVersion, {
      cardId: canvasCardId,
      points: [
        { x: 0.12, y: 0.28 },
        { x: 0.48, y: 0.62 },
      ],
    });
    if (!drawn.ok) return "stroke was rejected during planning";
    if (drawn.state.autopilot.phase !== "paused_by_human") return "stroke did not pause planning";
    if (drawn.state.strokes.length !== 1 || drawn.state.strokes[0]?.cardId !== canvasCardId) {
      return "stroke was not pinned during planning";
    }
    if (state.strokes.length !== 0) return "stroke mutated the caller";
  }
  const returned = commitView(viewed.state, viewed.state.stateVersion, state.mode);
  if (!returned.ok || returned.state.autopilot.phase !== state.autopilot.phase) {
    return "return view lost the railway phase";
  }
  if (
    state.autopilot.phase === "paused_by_human" ||
    state.autopilot.phase === "completed" ||
    state.autopilot.phase === "failed"
  ) {
    const agent = await applyBuildTick(state, state.stateVersion, "judge", router);
    if (!agent.ok || agent.state !== state) return `agent tick committed during ${state.autopilot.phase}`;
  }
  return assertToolCalls(state);
}

export async function runModelBasedPaths(): Promise<MbtReport> {
  const paths = getSimplePaths(pilotMachine, {
    events: {
      FAIL: [{ reason: "runner unavailable" }],
    },
  });
  const seen = new Set<PilotPhase>();
  let steps = 0;
  let state = createSampleWorkspace();
  const initial = await assertInvariants(state);
  if (initial) return { ok: false, path: 0, step: 0, detail: initial };
  seen.add(state.autopilot.phase);

  for (let pathIndex = 0; pathIndex < paths.length; pathIndex += 1) {
    const path = paths[pathIndex];
    if (!path) return { ok: false, path: pathIndex, step: 0, detail: "missing path" };
    state = createSampleWorkspace();
    for (let stepIndex = 0; stepIndex < path.steps.length; stepIndex += 1) {
      const step = path.steps[stepIndex];
      if (!step) return { ok: false, path: pathIndex, step: stepIndex, detail: "missing graph step" };
      const eventType: string = step.event.type;
      if (eventType === "xstate.init") {
        const initialPhase = phaseOf(step.state.value);
        if (initialPhase !== "idle" || state.autopilot.phase !== "idle") {
          return { ok: false, path: pathIndex, step: stepIndex, detail: "init left the idle state" };
        }
        seen.add("idle");
        continue;
      }
      if (!isPilotEvent(step.event)) {
        return { ok: false, path: pathIndex, step: stepIndex, detail: `graph event ${eventType} is not a pilot event` };
      }
      const previous = state.stateVersion;
      const committed = applyPilotEvent(state, state.stateVersion, step.event);
      if (!committed.ok) {
        return {
          ok: false,
          path: pathIndex,
          step: stepIndex,
          detail: `${step.event.type} was rejected from ${state.autopilot.phase}`,
        };
      }
      state = committed.state;
      steps += 1;
      if (state.stateVersion !== previous + 1) {
        return {
          ok: false,
          path: pathIndex,
          step: stepIndex,
          detail: `stateVersion ${previous} moved to ${state.stateVersion}`,
        };
      }
      const expected = phaseOf(step.state.value);
      if (!expected || state.autopilot.phase !== expected) {
        return {
          ok: false,
          path: pathIndex,
          step: stepIndex,
          detail: `workspace ${state.autopilot.phase} diverged from graph ${String(step.state.value)}`,
        };
      }
      seen.add(state.autopilot.phase);
      const violation = await assertInvariants(state);
      if (violation) return { ok: false, path: pathIndex, step: stepIndex, detail: violation };
    }
  }

  const missing = pilotPhases.filter((phase) => !seen.has(phase));
  if (missing.length > 0) {
    return { ok: false, path: paths.length, step: steps, detail: `uncovered phases ${missing.join(", ")}` };
  }
  return { ok: true, paths: paths.length, steps, phases: [...seen] };
}
