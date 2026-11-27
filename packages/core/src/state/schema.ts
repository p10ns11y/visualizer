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
  kind: z.enum(["transition", "human", "judgement", "brief", "view", "seed", "memory"]),
  message: z.string().min(1),
  from: z.string().optional(),
  to: z.string().optional(),
});
export type LogEntry = z.infer<typeof LogEntrySchema>;

export const ensemblyKinds = ["rule", "costly_mistake", "decision"] as const;
export const EnsemblyKindSchema = z.enum(ensemblyKinds);
export type EnsemblyKind = z.infer<typeof EnsemblyKindSchema>;

export const pulseTraceKinds = ["data", "context", "fact", "memory"] as const;
export const PulseTraceKindSchema = z.enum(pulseTraceKinds);
export type PulseTraceKind = z.infer<typeof PulseTraceKindSchema>;

export const pulseStatuses = ["user-stated", "tool-verified", "inferred", "unknown"] as const;
export const PulseStatusSchema = z.enum(pulseStatuses);
export type PulseStatus = z.infer<typeof PulseStatusSchema>;

export const pulseLocks = ["open", "locked"] as const;
export const PulseLockSchema = z.enum(pulseLocks);
export type PulseLock = z.infer<typeof PulseLockSchema>;

export const CoherenceMilliSchema = z.number().int().min(0).max(1000);

export const pulsePackSchema = "pulse-pack-v1" as const;

export const EnsemblyRecordSchema = z.object({
  id: z.string().min(1),
  timestamp: z.string().datetime(),
  kind: EnsemblyKindSchema,
  summary: z.string().min(1),
  rationale: z.string().min(1),
  provenance: z.string().min(1),
  confirmedOutcome: z.string().min(1).nullable(),
  traceKind: PulseTraceKindSchema.optional(),
  status: PulseStatusSchema.optional(),
  lock: PulseLockSchema.optional(),
  verifyHash: z.string().min(1).nullable().optional(),
  prefetchKey: z.string().min(1).nullable().optional(),
  supersededBy: z.string().min(1).nullable().optional(),
  coherenceMilli: CoherenceMilliSchema.optional(),
});
export type EnsemblyRecord = z.infer<typeof EnsemblyRecordSchema>;

export const PulseMemorySchema = EnsemblyRecordSchema;
export type PulseMemory = z.infer<typeof PulseMemorySchema>;

export const lessonSignals = ["friction", "rework", "adjustment"] as const;
export const LessonSignalSchema = z.enum(lessonSignals);
export type LessonSignal = z.infer<typeof LessonSignalSchema>;

export const WorkflowLessonSchema = z.object({
  id: z.string().min(1),
  recordedAt: z.string().datetime(),
  phase: PilotPhaseSchema,
  cardId: z.string().min(1).nullable(),
  signal: LessonSignalSchema,
  lesson: z.string().min(1),
  adjustment: z.string().min(1),
});
export type WorkflowLesson = z.infer<typeof WorkflowLessonSchema>;

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

export const fleetNodeKinds = ["bot", "routine", "task", "store"] as const;
export const FleetNodeKindSchema = z.enum(fleetNodeKinds);
export type FleetNodeKind = z.infer<typeof FleetNodeKindSchema>;

export const fleetEdgeKinds = ["hands_off", "triggers", "reads", "writes"] as const;
export const FleetEdgeKindSchema = z.enum(fleetEdgeKinds);
export type FleetEdgeKind = z.infer<typeof FleetEdgeKindSchema>;

export const FleetNodeSchema = z.object({
  id: z.string().min(1),
  kind: FleetNodeKindSchema,
  label: z.string().min(1),
  summary: z.string().min(1),
});
export type FleetNode = z.infer<typeof FleetNodeSchema>;

export const FleetEdgeSchema = z.object({
  id: z.string().min(1),
  fromId: z.string().min(1),
  toId: z.string().min(1),
  kind: FleetEdgeKindSchema,
  label: z.string().min(1),
  live: z.boolean(),
});
export type FleetEdge = z.infer<typeof FleetEdgeSchema>;

export const FleetGraphSchema = z.object({
  nodes: z.array(FleetNodeSchema),
  edges: z.array(FleetEdgeSchema),
});
export type FleetGraph = z.infer<typeof FleetGraphSchema>;

export const fleetProposalKinds = ["merge_routines", "flag_cycle", "flag_hotspot", "mark_dead_edge"] as const;
export const FleetProposalKindSchema = z.enum(fleetProposalKinds);
export type FleetProposalKind = z.infer<typeof FleetProposalKindSchema>;

export const fleetProposalStatuses = ["pending", "approved", "rejected"] as const;
export const FleetProposalStatusSchema = z.enum(fleetProposalStatuses);
export type FleetProposalStatus = z.infer<typeof FleetProposalStatusSchema>;

export const FleetProposalSchema = z.object({
  id: z.string().min(1),
  actionId: z.string().min(1),
  kind: FleetProposalKindSchema,
  summary: z.string().min(1),
  status: FleetProposalStatusSchema,
  subjectIds: z.array(z.string().min(1)).min(1),
  createdAt: z.string().datetime(),
});
export type FleetProposal = z.infer<typeof FleetProposalSchema>;

export const sampleFleetGraph: FleetGraph = FleetGraphSchema.parse({
  nodes: [
    { id: "bot-intake", kind: "bot", label: "Intake bot", summary: "Accepts one new task." },
    { id: "bot-router", kind: "bot", label: "Router bot", summary: "Hands work to sweeps and review." },
    { id: "bot-review", kind: "bot", label: "Review bot", summary: "Reads the shared pulse." },
    { id: "routine-morning", kind: "routine", label: "Morning sweep", summary: "Reads the ledger and writes the pulse." },
    { id: "routine-dawn", kind: "routine", label: "Dawn sweep", summary: "Overlaps the morning sweep." },
    { id: "task-classify", kind: "task", label: "Classify task", summary: "Hands off to the summary task." },
    { id: "task-summarize", kind: "task", label: "Summarize task", summary: "Hands back to classify and writes the ledger." },
    { id: "store-ledger", kind: "store", label: "Shared ledger", summary: "Append-only sample store." },
    { id: "store-pulse", kind: "store", label: "Shared pulse", summary: "Short sample memory store." },
    { id: "bot-spare", kind: "bot", label: "Spare notifier", summary: "No live connection." },
    { id: "routine-stale", kind: "routine", label: "Stale sweep", summary: "Only a dead edge remains." },
  ],
  edges: [
    { id: "edge-hand-intake", fromId: "bot-intake", toId: "bot-router", kind: "hands_off", label: "Hands off", live: true },
    { id: "edge-trig-morning", fromId: "bot-router", toId: "routine-morning", kind: "triggers", label: "Triggers", live: true },
    { id: "edge-trig-dawn", fromId: "bot-router", toId: "routine-dawn", kind: "triggers", label: "Triggers", live: true },
    { id: "edge-hand-review", fromId: "bot-router", toId: "bot-review", kind: "hands_off", label: "Hands off", live: true },
    { id: "edge-read-morning", fromId: "routine-morning", toId: "store-ledger", kind: "reads", label: "Reads", live: true },
    { id: "edge-read-dawn", fromId: "routine-dawn", toId: "store-ledger", kind: "reads", label: "Reads", live: true },
    { id: "edge-write-morning", fromId: "routine-morning", toId: "store-pulse", kind: "writes", label: "Writes", live: true },
    { id: "edge-read-review", fromId: "bot-review", toId: "store-pulse", kind: "reads", label: "Reads", live: true },
    { id: "edge-hand-classify", fromId: "task-classify", toId: "task-summarize", kind: "hands_off", label: "Hands off", live: true },
    { id: "edge-hand-summarize", fromId: "task-summarize", toId: "task-classify", kind: "hands_off", label: "Hands off", live: true },
    { id: "edge-write-summarize", fromId: "task-summarize", toId: "store-ledger", kind: "writes", label: "Writes", live: true },
    { id: "edge-stale", fromId: "routine-stale", toId: "store-ledger", kind: "writes", label: "Writes", live: false },
  ],
});

export const WorkspaceStateSchema = z.object({
  stateVersion: z.number().int().nonnegative(),
  mode: z.enum(["cockpit", "code"]),
  problemCards: z.array(ProblemCardSchema),
  strokes: z.array(SketchStrokeSchema).default(() => []),
  ensemblyLedger: z.array(EnsemblyRecordSchema).default(() => []),
  pulseMemory: z.array(PulseMemorySchema).default(() => []),
  workflowLessons: z.array(WorkflowLessonSchema).default(() => []),
  fleetGraph: FleetGraphSchema.default(() => structuredClone(sampleFleetGraph)),
  fleetProposals: z.array(FleetProposalSchema).default(() => []),
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
