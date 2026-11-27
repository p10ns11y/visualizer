import { createActor, setup } from "xstate";
import { z } from "zod";
import {
  pilotPhases,
  type PilotEvent,
  type PilotPhase,
} from "../state/schema.js";

const emptyEvent = z.object({});

export const pilotMachine = setup({
  schemas: {
    events: {
      START: emptyEvent,
      PLAN_READY: emptyEvent,
      DRIFT: emptyEvent,
      CLEAR: emptyEvent,
      HUMAN_PAUSE: emptyEvent,
      RESUME: emptyEvent,
      COMPLETE: emptyEvent,
      FAIL: z.object({ reason: z.string() }),
    },
  },
}).createMachine({
  id: "pilot",
  initial: "idle",
  states: {
    idle: {
      on: { START: { target: "planning" } },
    },
    planning: {
      on: {
        PLAN_READY: { target: "running" },
        HUMAN_PAUSE: { target: "paused_by_human" },
        FAIL: { target: "failed" },
      },
    },
    running: {
      on: {
        DRIFT: { target: "drift_detected" },
        HUMAN_PAUSE: { target: "paused_by_human" },
        COMPLETE: { target: "completed" },
        FAIL: { target: "failed" },
      },
    },
    drift_detected: {
      on: {
        CLEAR: { target: "resuming" },
        HUMAN_PAUSE: { target: "paused_by_human" },
        FAIL: { target: "failed" },
      },
    },
    paused_by_human: {
      on: { RESUME: { target: "resuming" } },
    },
    resuming: {
      on: {
        PLAN_READY: { target: "running" },
        COMPLETE: { target: "completed" },
        HUMAN_PAUSE: { target: "paused_by_human" },
        FAIL: { target: "failed" },
      },
    },
    completed: { type: "final" },
    failed: { type: "final" },
  },
});

function isPilotPhase(value: string): value is PilotPhase {
  return pilotPhases.some((phase) => phase === value);
}

export function reducePhase(trace: readonly PilotEvent[]): PilotPhase {
  const actor = createActor(pilotMachine);
  actor.start();
  for (const event of trace) actor.send(event);
  const value = actor.getSnapshot().value;
  actor.stop();
  if (typeof value !== "string" || !isPilotPhase(value)) {
    throw new Error("Pilot railway left the finite state set");
  }
  return value;
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
