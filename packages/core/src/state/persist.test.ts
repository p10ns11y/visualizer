import { describe, expect, it } from "vitest";
import {
  legacyWorkspaceStorageKey,
  readPersistedWorkspace,
  readWorkspaceStorage,
  workspaceStorageKey,
} from "./persist.js";

const pr3Workspace = {
  stateVersion: 3,
  mode: "cockpit",
  logSeq: 4,
  brief: null,
  tokens: {
    themeId: "paper",
    accent: "#0e6b62",
    surface: "#f3eee6",
    ink: "#1c1915",
    displayFont: "Fraunces",
    bodyFont: "Outfit",
  },
  problemCards: [
    {
      id: "card-canvas",
      title: "Freehand canvas sketching",
      statement: "Draw on the cockpit canvas and pin each stroke to the problem card it explains.",
      acceptance: "Strokes survive a reload and sit on the card that owns them.",
    },
    {
      id: "card-bridge",
      title: "Live WebMCP modelContext bridge",
      statement: "Publish the typed workspace on document.modelContext so a local tool reads the same state the cockpit shows.",
      acceptance: "A local tool reads problem cards, mockups, and stateVersion from document.modelContext.",
    },
    {
      id: "card-log",
      title: "Local board SQLite log",
      statement: "Mirror the structured event log into a local @vercel/board SQLite file.",
      acceptance: "Each railway transition appends one row that matches the in-memory event log.",
    },
  ],
  strokes: [
    {
      id: "stroke-pr3",
      cardId: "card-canvas",
      points: [
        { x: 0.2, y: 0.4 },
        { x: 0.7, y: 0.5, pressure: 0.4 },
      ],
    },
  ],
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
  ],
  connections: [],
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
};

describe("persisted workspace", () => {
  it("keeps a PR #3 visualizer.workspace payload, including strokes and both memory layers", () => {
    const hydrated = readPersistedWorkspace(JSON.stringify(pr3Workspace));
    expect(workspaceStorageKey).toBe("visualizer.workspace");
    expect(hydrated?.stateVersion).toBe(3);
    expect(hydrated?.strokes).toEqual(pr3Workspace.strokes);
    expect(hydrated?.ensemblyLedger.map((record) => record.id)).toEqual(["ens-rule-stateversion"]);
    expect(hydrated?.pulseMemory.map((pulse) => pulse.id)).toEqual(["ens-rule-stateversion"]);
    expect(hydrated?.workflowLessons.map((lesson) => lesson.id)).toEqual(["lesson-planning-bridge"]);
    expect(hydrated?.problemCards.find((card) => card.id === "card-log")?.title).toBe(
      "Local board SQLite log",
    );
  });

  it("reads visualizer.workspace.v1 only when the current key is empty", () => {
    const raw = JSON.stringify(pr3Workspace);
    const current = readWorkspaceStorage((key) => (key === workspaceStorageKey ? raw : null));
    expect(current?.strokes).toHaveLength(1);
    const legacy = readWorkspaceStorage((key) =>
      key === legacyWorkspaceStorageKey ? raw : null,
    );
    expect(legacyWorkspaceStorageKey).toBe("visualizer.workspace.v1");
    expect(legacy?.pulseMemory).toHaveLength(1);
    expect(legacy?.strokes[0]?.id).toBe("stroke-pr3");
  });
});
