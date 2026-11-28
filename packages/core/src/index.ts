export { shellScreen, shellScreenDocument, shellScreenSchema } from "./shell.js";
export type { ShellScreen } from "./shell.js";

export { flowMachine, flowStateIds } from "./flow/machine.js";
export { answerQuestion, encodeAnswers, questionIds, questions } from "./ask/questions.js";
export type {
  Answers,
  HoldKind,
  Question,
  QuestionId,
  ReachKind,
  WhatKind,
  WhoKind,
} from "./ask/questions.js";
export { templateFor, templates } from "./ask/templates.js";
export type { FrameNode, WireframeTemplate } from "./ask/templates.js";
export {
  decisionIds,
  decisionLabel,
  emptyDesign,
  encodeGaps,
  gapRules,
  openGaps,
} from "./ask/gaps.js";
export type { DecisionId, Design, Gap } from "./ask/gaps.js";
export { viewFor, viewMap } from "./view/map.js";
export type { ViewNode, ViewSpec } from "./view/map.js";
export { applyFlowEvent, createFlow, flowCan, flowValueKey, readFlowValue } from "./flow/apply.js";
export type { FlowConflict, FlowResult } from "./flow/apply.js";
export {
  FlowEventSchema,
  FlowLogEntrySchema,
  FlowModeSchema,
  FlowMotionSchema,
  FlowStageSchema,
  FlowStateSchema,
  flowEventTypes,
  flowModes,
  flowMotions,
  flowStages,
  eventLogWindow,
  logLine,
  recentLog,
  stageLabel,
  stageLine,
} from "./flow/schema.js";
export type {
  FlowEvent,
  FlowLogEntry,
  FlowMode,
  FlowMotion,
  FlowStage,
  FlowState,
} from "./flow/schema.js";
