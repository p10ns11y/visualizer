import {
  WorkspaceStateSchema,
  themePresets,
  type WorkspaceState,
} from "./schema.js";

export function createSampleWorkspace(): WorkspaceState {
  return WorkspaceStateSchema.parse({
    stateVersion: 0,
    mode: "cockpit",
    logSeq: 1,
    brief: null,
    tokens: themePresets.paper,
    problemCards: [
      {
        id: "card-canvas",
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
        title: "Local board SQLite log",
        statement:
          "Mirror the structured event log into a local @vercel/board SQLite file.",
        acceptance:
          "Each railway transition appends one row that matches the in-memory event log.",
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
        title: "Board log",
        kind: "log",
        x: 8,
        y: 58,
        summary: "Local SQLite rows fed by the event log.",
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
