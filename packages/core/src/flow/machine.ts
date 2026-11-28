import { setup } from "xstate";
import { z } from "zod";

const emptyEvent = z.object({});

function stageRegion(next: string) {
  return {
    initial: "live" as const,
    states: {
      live: {
        on: {
          START: { target: next },
          PAUSE: { target: "paused" },
          STOP: { target: "#flow.stage.done" },
        },
      },
      paused: {
        on: {
          START: { target: "live" },
          STOP: { target: "#flow.stage.done" },
        },
      },
    },
  };
}

export const flowMachine = setup({
  schemas: {
    events: {
      START: emptyEvent,
      PAUSE: emptyEvent,
      STOP: emptyEvent,
      TOGGLE_MODE: emptyEvent,
    },
  },
}).createMachine({
  id: "flow",
  type: "parallel",
  states: {
    stage: {
      initial: "asking",
      states: {
        asking: stageRegion("#flow.stage.editing"),
        editing: stageRegion("#flow.stage.choosingTools"),
        choosingTools: stageRegion("#flow.stage.building"),
        building: stageRegion("#flow.stage.done"),
        done: { type: "final" },
      },
    },
    mode: {
      initial: "simple",
      states: {
        simple: { on: { TOGGLE_MODE: { target: "advanced" } } },
        advanced: { on: { TOGGLE_MODE: { target: "simple" } } },
      },
    },
  },
});

export const flowStateIds = [
  "#flow.stage.asking.live",
  "#flow.stage.asking.paused",
  "#flow.stage.editing.live",
  "#flow.stage.editing.paused",
  "#flow.stage.choosingTools.live",
  "#flow.stage.choosingTools.paused",
  "#flow.stage.building.live",
  "#flow.stage.building.paused",
  "#flow.stage.done",
  "#flow.mode.simple",
  "#flow.mode.advanced",
] as const;
