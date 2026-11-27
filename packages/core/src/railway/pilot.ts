import { createActor, setup } from "xstate";
import {
  pilotPhases,
  type PilotEvent,
  type PilotPhase,
} from "../state/schema.js";

export const pilotMachine = setup({
  types: {
    events: {} as PilotEvent,
  },
}).createMachine({
  id: "pilot",
  initial: "idle",
  states: {
    idle: {
      on: { START: "planning" },
    },
    planning: {
      on: {
        PLAN_READY: "running",
        HUMAN_PAUSE: "paused_by_human",
        FAIL: "failed",
      },
    },
    running: {
      on: {
        DRIFT: "drift_detected",
        HUMAN_PAUSE: "paused_by_human",
        COMPLETE: "completed",
        FAIL: "failed",
      },
    },
    drift_detected: {
      on: {
        CLEAR: "resuming",
        HUMAN_PAUSE: "paused_by_human",
        FAIL: "failed",
      },
    },
    paused_by_human: {
      on: { RESUME: "resuming" },
    },
    resuming: {
      on: {
        PLAN_READY: "running",
        COMPLETE: "completed",
        HUMAN_PAUSE: "paused_by_human",
        FAIL: "failed",
      },
    },
    completed: { type: "final" },
    failed: { type: "final" },
  },
});

export function reducePhase(trace: readonly PilotEvent[]): PilotPhase {
  const actor = createActor(pilotMachine);
  actor.start();
  for (const event of trace) actor.send(event);
  const value = actor.getSnapshot().value;
  actor.stop();
  if (typeof value !== "string" || !pilotPhases.includes(value as PilotPhase)) {
    throw new Error("Pilot railway left the finite state set");
  }
  return value as PilotPhase;
}

export const railwayOrder: readonly PilotPhase[] = [
  "idle",
  "planning",
  "running",
  "drift_detected",
  "paused_by_human",
  "resuming",
  "completed",
  "failed",
];
