import { definePrimitive } from "@ui-sdk/core";
import { createParts } from "@ui-sdk/react/primitive";
import { flowStages, type FlowStage } from "@visualizer/core";
import { stageMarkName } from "./allow.js";

type StageMarkOptions = { stage?: string };

function readStage(value: string | undefined): FlowStage {
  if (value !== undefined && (flowStages as readonly string[]).includes(value)) {
    return value as FlowStage;
  }
  return "asking";
}

const stageMark = definePrimitive({
  name: stageMarkName,
  options: { stage: "string" },
  state: (options: StageMarkOptions) => ({ stage: readStage(options.stage) }),
  controlled: ["stage"],
  sync: (options: StageMarkOptions) => ({ stage: readStage(options.stage) }),
  api: () => ({}),
  agent: { actions: [] },
  slots: (slot) => ({
    root: slot<{}, { stage: FlowStage }>({
      state: (state) => ({ stage: state.stage }),
      attrs: (state) => ({
        "data-stage-mark": state.stage,
      }),
    }),
  }),
});

const stageMarkParts = createParts(stageMark, { root: "p" });

export const StageMark = stageMarkParts.Root;
