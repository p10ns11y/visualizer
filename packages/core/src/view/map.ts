import type { FlowMode, FlowStage } from "../flow/schema.js";

export type ViewNode =
  | { kind: "stage-mark" }
  | { kind: "button"; label: string }
  | { kind: "collapsible"; label: "later" };

export type ViewSpec = {
  mode: FlowMode;
  stage: FlowStage;
  nodes: readonly ViewNode[];
};

const placeLabel = {
  asking: "Questions",
  editing: "Preview",
  choosingTools: "Tools",
  building: "Build",
  done: "Done",
} satisfies Record<FlowStage, string>;

function spec(mode: FlowMode, stage: FlowStage): ViewSpec {
  const nodes: ViewNode[] = [
    { kind: "stage-mark" },
    { kind: "button", label: placeLabel[stage] },
  ];
  if (mode === "advanced") nodes.push({ kind: "collapsible", label: "later" });
  return { mode, stage, nodes };
}

export const viewMap = {
  simple: {
    asking: spec("simple", "asking"),
    editing: spec("simple", "editing"),
    choosingTools: spec("simple", "choosingTools"),
    building: spec("simple", "building"),
    done: spec("simple", "done"),
  },
  advanced: {
    asking: spec("advanced", "asking"),
    editing: spec("advanced", "editing"),
    choosingTools: spec("advanced", "choosingTools"),
    building: spec("advanced", "building"),
    done: spec("advanced", "done"),
  },
} satisfies Record<FlowMode, Record<FlowStage, ViewSpec>>;

export function viewFor(mode: FlowMode, stage: FlowStage): ViewSpec {
  return viewMap[mode][stage];
}
