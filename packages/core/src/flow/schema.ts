import { z } from "zod";

export const flowStages = ["asking", "editing", "choosingTools", "building", "done"] as const;
export const FlowStageSchema = z.enum(flowStages);
export type FlowStage = z.infer<typeof FlowStageSchema>;

export const flowMotions = ["live", "paused"] as const;
export const FlowMotionSchema = z.enum(flowMotions);
export type FlowMotion = z.infer<typeof FlowMotionSchema>;

export const flowModes = ["simple", "advanced"] as const;
export const FlowModeSchema = z.enum(flowModes);
export type FlowMode = z.infer<typeof FlowModeSchema>;

export const flowEventTypes = ["START", "PAUSE", "STOP", "TOGGLE_MODE"] as const;
export const FlowEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("START") }),
  z.object({ type: z.literal("PAUSE") }),
  z.object({ type: z.literal("STOP") }),
  z.object({ type: z.literal("TOGGLE_MODE") }),
]);
export type FlowEvent = z.infer<typeof FlowEventSchema>;

export const FlowLogEntrySchema = z.object({
  id: z.string().min(1),
  stateVersion: z.number().int().nonnegative(),
  type: z.enum(flowEventTypes),
  fromStage: FlowStageSchema,
  toStage: FlowStageSchema,
  fromMotion: FlowMotionSchema,
  toMotion: FlowMotionSchema,
  fromMode: FlowModeSchema,
  toMode: FlowModeSchema,
});
export type FlowLogEntry = z.infer<typeof FlowLogEntrySchema>;

export const FlowStateSchema = z.object({
  stateVersion: z.number().int().nonnegative(),
  stage: FlowStageSchema,
  motion: FlowMotionSchema,
  mode: FlowModeSchema,
  eventLog: z.array(FlowLogEntrySchema),
});
export type FlowState = z.infer<typeof FlowStateSchema>;

export const eventLogWindow = 20;

export function recentLog(entries: readonly FlowLogEntry[]): FlowLogEntry[] {
  if (entries.length <= eventLogWindow) return [...entries];
  return entries.slice(entries.length - eventLogWindow);
}

export function stageLabel(stage: FlowStage): string {
  switch (stage) {
    case "asking":
      return "asking";
    case "editing":
      return "editing";
    case "choosingTools":
      return "choosing tools";
    case "building":
      return "building";
    case "done":
      return "done";
    default: {
      const unreachable: never = stage;
      return unreachable;
    }
  }
}

function placeLabel(stage: FlowStage, motion: FlowMotion): string {
  const name = stageLabel(stage);
  if (stage === "done" || motion === "live") return name;
  return `${name} paused`;
}

export function logLine(entry: FlowLogEntry): string {
  switch (entry.type) {
    case "TOGGLE_MODE":
      return `TOGGLE_MODE ${entry.fromMode} to ${entry.toMode}`;
    case "START":
    case "PAUSE":
    case "STOP": {
      const from = placeLabel(entry.fromStage, entry.fromMotion);
      const to = placeLabel(entry.toStage, entry.toMotion);
      return from === to ? `${entry.type} ${to}` : `${entry.type} ${from} to ${to}`;
    }
    default: {
      const unreachable: never = entry.type;
      return unreachable;
    }
  }
}

export function stageLine(state: Pick<FlowState, "stage" | "motion" | "mode">): string {
  const paused = state.motion === "paused" ? " paused" : "";
  return `${stageLabel(state.stage)}${paused} · ${state.mode}`;
}
