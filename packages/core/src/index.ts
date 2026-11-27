export {
  AutopilotSchema,
  BannerSchema,
  BuildBriefSchema,
  BuildCursorSchema,
  ConnectionSchema,
  DesignTokensSchema,
  JudgementSchema,
  LogEntrySchema,
  MockupNodeSchema,
  PilotEventSchema,
  PilotPhaseSchema,
  ProblemCardSchema,
  SketchPointSchema,
  SketchStrokeSchema,
  ThemeIdSchema,
  WorkspaceStateSchema,
  bannerFor,
  pilotPhases,
  themeIds,
  themePresets,
  workingPhases,
} from "./state/schema.js";
export type {
  AutopilotState,
  Banner,
  BuildBrief,
  BuildCursor,
  Connection,
  DesignTokens,
  Judgement,
  LogEntry,
  MockupNode,
  PilotEvent,
  PilotPhase,
  ProblemCard,
  SketchPoint,
  SketchStroke,
  ThemeId,
  WorkspaceState,
} from "./state/schema.js";

export { createSampleWorkspace, canvasCardId } from "./state/sample.js";
export {
  readPersistedWorkspace,
  serializeWorkspace,
  workspaceStorageKey,
} from "./state/persist.js";
export { appendSketchStroke, clearSketchStrokes, normalizeSketchPoints } from "./state/strokes.js";
export {
  StateConflictError,
  applyPilotEvent,
  assertCommit,
  commitHuman,
  commitView,
  pauseRun,
  resumeRun,
} from "./state/store.js";
export type { CommitError, CommitResult, ConflictError } from "./state/store.js";

export { pilotMachine, railwayOrder, reducePhase } from "./railway/pilot.js";

export { BrainRouter, tier1Judge } from "./brain/router.js";
export type {
  BrainInput,
  BrainTier,
  FrontierClient,
  LocalDecisionClient,
} from "./brain/router.js";
export {
  createLocalDecisionClient,
  localModelConfigFromEnv,
} from "./brain/local-model.js";
export type { LocalModelConfig } from "./brain/local-model.js";
export {
  BrainEventSchema,
  StreamJudgementSchema,
  chunkText,
  collectParsedSteps,
  collectTrackedSteps,
  readJudgementStream,
  requireDriftNote,
} from "./brain/stream.js";
export type { BrainEvent } from "./brain/stream.js";

export {
  ToolHandoffSchema,
  connectorCatalog,
  connectorIds,
  createInProcessRunner,
  localRunners,
  runnerIds,
} from "./tools/delegation.js";
export type {
  ConnectorContract,
  ConnectorId,
  LocalToolRunner,
  RunnerId,
  ToolRunRequest,
  ToolRunResult,
} from "./tools/delegation.js";

export {
  applyBuildTick,
  buildTickOrder,
  remainingTicks,
  runSelfBootstrap,
} from "./bootstrap/run.js";
export type { BuildTick } from "./bootstrap/run.js";
