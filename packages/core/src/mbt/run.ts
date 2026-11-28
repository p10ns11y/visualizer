import { getSimplePaths } from "xstate/graph";
import { applyBuildTick } from "../bootstrap/run.js";
import { pilotMachine } from "../railway/pilot.js";
import { createStandIn } from "../state/stand-in.js";
import {
  WorkspaceStateSchema,
  pilotPhases,
  type PilotEvent,
  type PilotPhase,
  type WorkspaceState,
} from "../state/schema.js";
import { applyPilotEvent, commitView } from "../state/store.js";

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

async function assertInvariants(state: WorkspaceState): Promise<string | null> {
  if (state.stateVersion < 0) return "stateVersion decreased";
  const parsed = WorkspaceStateSchema.safeParse(state);
  if (!parsed.success) return "workspace failed schema validation";
  const other = state.mode === "cockpit" ? "code" : "cockpit";
  const viewed = commitView(state, state.stateVersion, other);
  if (!viewed.ok) return "view switch was rejected";
  if (
    viewed.state.problemCards.some(
      (card, index) => card.statement !== state.problemCards[index]?.statement,
    )
  ) {
    return "view switch changed a problem statement";
  }
  if (viewed.state.autopilot.phase !== state.autopilot.phase) return "view switch changed the railway";
  if (viewed.state.stateVersion !== state.stateVersion + 1) return "view switch did not raise stateVersion";
  const returned = commitView(viewed.state, viewed.state.stateVersion, state.mode);
  if (!returned.ok || returned.state.autopilot.phase !== state.autopilot.phase) {
    return "return view lost the railway phase";
  }
  if (
    state.autopilot.phase === "paused_by_human" ||
    state.autopilot.phase === "completed" ||
    state.autopilot.phase === "failed"
  ) {
    const agent = await applyBuildTick(state, state.stateVersion, "judge");
    if (!agent.ok || agent.state !== state) return `agent tick committed during ${state.autopilot.phase}`;
  }
  return null;
}

export async function runModelBasedPaths(): Promise<MbtReport> {
  const paths = getSimplePaths(pilotMachine, {
    events: {
      FAIL: [{ reason: "runner unavailable" }],
    },
  });
  const seen = new Set<PilotPhase>();
  let steps = 0;
  let state = createStandIn();
  const initial = await assertInvariants(state);
  if (initial) return { ok: false, path: 0, step: 0, detail: initial };
  seen.add(state.autopilot.phase);

  for (let pathIndex = 0; pathIndex < paths.length; pathIndex += 1) {
    const path = paths[pathIndex];
    if (!path) return { ok: false, path: pathIndex, step: 0, detail: "missing path" };
    state = createStandIn();
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
        return {
          ok: false,
          path: pathIndex,
          step: stepIndex,
          detail: `graph event ${eventType} is not a pilot event`,
        };
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
