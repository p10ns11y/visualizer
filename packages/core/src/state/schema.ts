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

export const SketchPointSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  pressure: z.number().min(0).max(1).optional(),
});
export type SketchPoint = z.infer<typeof SketchPointSchema>;

export const SketchStrokeSchema = z.object({
  id: z.string().min(1),
  cardId: z.string().min(1),
  points: z.array(SketchPointSchema).min(1),
});
export type SketchStroke = z.infer<typeof SketchStrokeSchema>;

export const MockupNodeSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  kind: z.enum(["canvas", "bridge", "log"]),
  x: z.number(),
  y: z.number(),
  summary: z.string().min(1),
});
export type MockupNode = z.infer<typeof MockupNodeSchema>;

export const ConnectionSchema = z.object({
  id: z.string().min(1),
  fromId: z.string().min(1),
  toId: z.string().min(1),
  label: z.string().min(1),
});
export type Connection = z.infer<typeof ConnectionSchema>;

export const themeIds = ["paper", "ink", "dusk"] as const;
export const ThemeIdSchema = z.enum(themeIds);
export type ThemeId = z.infer<typeof ThemeIdSchema>;

export const DesignTokensSchema = z.object({
  themeId: ThemeIdSchema,
  accent: z.string().min(1),
  surface: z.string().min(1),
  ink: z.string().min(1),
  displayFont: z.string().min(1),
  bodyFont: z.string().min(1),
});
export type DesignTokens = z.infer<typeof DesignTokensSchema>;

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
  kind: z.enum(["transition", "human", "judgement", "brief", "view", "seed"]),
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
  problemCards: z.array(ProblemCardSchema),
  strokes: z.array(SketchStrokeSchema),
  mockups: z.array(MockupNodeSchema),
  connections: z.array(ConnectionSchema),
  tokens: DesignTokensSchema,
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

export const themePresets: Record<ThemeId, DesignTokens> = {
  paper: {
    themeId: "paper",
    accent: "#0e6b62",
    surface: "#f3eee6",
    ink: "#1c1915",
    displayFont: "Fraunces",
    bodyFont: "Outfit",
  },
  ink: {
    themeId: "ink",
    accent: "#e2b15a",
    surface: "#14171c",
    ink: "#f4efe6",
    displayFont: "Fraunces",
    bodyFont: "Outfit",
  },
  dusk: {
    themeId: "dusk",
    accent: "#7d9cff",
    surface: "#1b1a33",
    ink: "#f6f1ff",
    displayFont: "Fraunces",
    bodyFont: "Outfit",
  },
};
