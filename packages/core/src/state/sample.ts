import {
  WorkspaceStateSchema,
  themePresets,
  type WorkspaceState,
} from "./schema.js";

export const canvasCardId = "card-canvas";

export function createSampleWorkspace(): WorkspaceState {
  return WorkspaceStateSchema.parse({
    stateVersion: 0,
    mode: "cockpit",
    logSeq: 1,
    brief: null,
    tokens: themePresets.paper,
    problemCards: [
      {
        id: canvasCardId,
        title: "Freehand canvas sketching",
        statement:
          "Draw on the cockpit canvas and pin each stroke to the problem card it explains.",
        acceptance: "Strokes survive a reload and sit on the card that owns them.",
      },
      {
        id: "card-bridge",
        title: "Live WebMCP modelContext bridge",
        statement:
          "Publish the typed workspace on document.modelContext so a local tool reads the same state the cockpit shows.",
        acceptance:
          "A local tool reads problem cards, mockups, and stateVersion from document.modelContext.",
      },
      {
        id: "card-log",
        title: "Ensembly shared log",
        statement: "Append structured records to the Ensembly shared log.",
        acceptance:
          "A local write with the current stateVersion appends one Ensembly record and rejects a stale stateVersion.",
      },
    ],
    strokes: [],
    ensemblyLedger: [
      {
        id: "ens-rule-stateversion",
        timestamp: "2026-11-27T00:00:00Z",
        kind: "rule",
        summary: "A stale stateVersion never overwrites the workspace.",
        rationale: "Two writers otherwise drop a human edit.",
        provenance: "packages/core/src/state/store.ts",
        confirmedOutcome: "Stale writes return STATE_CONFLICT.",
      },
      {
        id: "ens-mistake-stale-tick",
        timestamp: "2026-11-27T00:00:01Z",
        kind: "costly_mistake",
        summary: "Applying a judge tick after a human edit restores the pre-edit workspace.",
        rationale: "The tick awaits, then commits the snapshot it started with.",
        provenance: "apps/web/src/tick-guard.ts",
        confirmedOutcome: "The tick is dropped when stateVersion moved.",
      },
      {
        id: "ens-decision-ledger",
        timestamp: "2026-11-27T00:00:02Z",
        kind: "decision",
        summary: "Keep the Ensembly ledger append-only and rebuild the graph from it.",
        rationale: "The graph is a projection. The ledger is the record that can be checked.",
        provenance: "packages/core/src/memory/ensembly.ts",
        confirmedOutcome: null,
      },
    ],
    pulseMemory: [
      {
        id: "ens-rule-stateversion",
        timestamp: "2026-11-27T00:00:00Z",
        kind: "rule",
        summary: "A stale stateVersion never overwrites the workspace.",
        rationale: "Two writers otherwise drop a human edit.",
        provenance: "packages/core/src/state/store.ts",
        confirmedOutcome: "Stale writes return STATE_CONFLICT.",
      },
    ],
    workflowLessons: [
      {
        id: "lesson-planning-bridge",
        recordedAt: "2026-11-27T00:00:03Z",
        phase: "planning",
        cardId: "card-bridge",
        signal: "friction",
        lesson: "Publishing the bridge before the statement settles forces a rewrite.",
        adjustment: "Read the card statement before the bridge publish.",
      },
    ],
    mockups: [
      {
        id: "plate-canvas",
        title: "Canvas plate",
        kind: "canvas",
        x: 4,
        y: 6,
        summary: "Stroke layer bound to the freehand canvas card.",
      },
      {
        id: "plate-bridge",
        title: "modelContext bridge",
        kind: "bridge",
        x: 52,
        y: 6,
        summary: "document.modelContext publishing the live workspace.",
      },
      {
        id: "plate-log",
        title: "Ensembly log",
        kind: "log",
        x: 8,
        y: 58,
        summary: "Ensembly shared-log records appended from the workspace.",
      },
    ],
    connections: [
      {
        id: "edge-publish",
        fromId: "plate-canvas",
        toId: "plate-bridge",
        label: "publish",
      },
      {
        id: "edge-append",
        fromId: "plate-bridge",
        toId: "plate-log",
        label: "append",
      },
    ],
    autopilot: {
      phase: "idle",
      cursor: "start",
      trace: [],
      judgement: null,
      banner: "hidden",
    },
    eventLog: [
      {
        id: "log-1",
        stateVersion: 0,
        kind: "seed",
        message: "Workspace seeded with Visualizer Step 2 problem cards.",
      },
    ],
  });
}
