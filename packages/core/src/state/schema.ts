import { z } from "zod";

export const pilotPhases = [
  "idle",
  "planning",
  "running",
  "drift_detected",
  "paused_by_human",
  "resuming",
  "completed",
  "failed",
] as const;

export const PilotPhaseSchema = z.enum(pilotPhases);
export type PilotPhase = z.infer<typeof PilotPhaseSchema>;

export const PilotEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("START") }),
  z.object({ type: z.literal("PLAN_READY") }),
  z.object({ type: z.literal("DRIFT") }),
  z.object({ type: z.literal("CLEAR") }),
  z.object({ type: z.literal("HUMAN_PAUSE") }),
  z.object({ type: z.literal("RESUME") }),
  z.object({ type: z.literal("COMPLETE") }),
  z.object({ type: z.literal("FAIL"), reason: z.string() }),
]);
export type PilotEvent = z.infer<typeof PilotEventSchema>;

export const JudgementSchema = z.object({
  tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  route: z.string().min(1),
  rank: z.number().min(0).max(1),
  drift: z.boolean(),
  reason: z.string().min(1),
});
export type Judgement = z.infer<typeof JudgementSchema>;

export const ProblemCardSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  statement: z.string().min(1),
  acceptance: z.string().min(1),
});
export type ProblemCard = z.infer<typeof ProblemCardSchema>;

export const buildCursors = ["start", "judge", "engage", "finish", "done"] as const;
export const BuildCursorSchema = z.enum(buildCursors);
export type BuildCursor = z.infer<typeof BuildCursorSchema>;

export const BannerSchema = z.enum(["hidden", "working", "paused", "drift"]);
export type Banner = z.infer<typeof BannerSchema>;

export const AutopilotSchema = z.object({
  phase: PilotPhaseSchema,
  cursor: BuildCursorSchema,
  trace: z.array(PilotEventSchema),
  judgement: JudgementSchema.nullable(),
  banner: BannerSchema,
});
export type AutopilotState = z.infer<typeof AutopilotSchema>;

export const LogEntrySchema = z.object({
  id: z.string().min(1),
  stateVersion: z.number().int().nonnegative(),
  kind: z.enum(["transition", "human", "view"]),
  message: z.string().min(1),
  from: z.string().optional(),
  to: z.string().optional(),
});
export type LogEntry = z.infer<typeof LogEntrySchema>;

export const BuildBriefSchema = z.object({
  title: z.string().min(1),
  verified: z.boolean(),
  problems: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      acceptance: z.string(),
    }),
  ),
  route: z.string().min(1),
  tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  tools: z.array(z.string()),
  connectors: z.array(z.string()),
  steps: z.array(z.string()),
  runnerSummary: z.string().min(1),
});
export type BuildBrief = z.infer<typeof BuildBriefSchema>;

export const WorkspaceStateSchema = z.object({
  stateVersion: z.number().int().nonnegative(),
  mode: z.enum(["cockpit", "code"]),
  problemCards: z.array(ProblemCardSchema).min(1),
  autopilot: AutopilotSchema,
  eventLog: z.array(LogEntrySchema),
  brief: BuildBriefSchema.nullable(),
  logSeq: z.number().int().nonnegative(),
});
export type WorkspaceState = z.infer<typeof WorkspaceStateSchema>;

export const workingPhases: readonly PilotPhase[] = [
  "planning",
  "running",
  "drift_detected",
  "resuming",
];

export function bannerFor(phase: PilotPhase): Banner {
  if (phase === "paused_by_human") return "paused";
  if (phase === "drift_detected") return "drift";
  if (workingPhases.includes(phase)) return "working";
  return "hidden";
}
