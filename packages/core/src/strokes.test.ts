import { describe, expect, it } from "vitest";
import { canvasCardId, createSampleWorkspace } from "./state/sample.js";
import { readPersistedWorkspace, serializeWorkspace } from "./state/persist.js";
import { appendSketchStroke, clearSketchStrokes } from "./state/strokes.js";
import { applyPilotEvent, assertCommit } from "./state/store.js";

const ink = [
  { x: 0.1, y: 0.2 },
  { x: 0.4, y: 0.55 },
  { x: 1.4, y: -0.2 },
];

describe("sketch strokes", () => {
  it("pins a stroke to a problem card and rejects a stale write", () => {
    const seeded = createSampleWorkspace();
    const drawn = appendSketchStroke(seeded, seeded.stateVersion, {
      cardId: canvasCardId,
      points: ink,
    });
    expect(drawn.ok).toBe(true);
    if (!drawn.ok) return;
    expect(drawn.state.stateVersion).toBe(1);
    expect(drawn.state.autopilot.phase).toBe("idle");
    expect(drawn.state.strokes).toEqual([
      {
        id: "stroke-2",
        cardId: canvasCardId,
        points: [
          { x: 0.1, y: 0.2 },
          { x: 0.4, y: 0.55 },
          { x: 1, y: 0 },
        ],
      },
    ]);
    const stale = appendSketchStroke(drawn.state, seeded.stateVersion, {
      cardId: canvasCardId,
      points: ink,
    });
    expect(stale.ok).toBe(false);
    if (stale.ok) return;
    expect(stale.error).toMatchObject({ code: "STATE_CONFLICT", actualVersion: 1 });
    expect(drawn.state.strokes).toHaveLength(1);
  });

  it("pauses a working phase without dropping the stroke", () => {
    let state = assertCommit(applyPilotEvent(createSampleWorkspace(), 0, { type: "START" }));
    state = assertCommit(
      appendSketchStroke(state, state.stateVersion, {
        cardId: canvasCardId,
        points: [
          { x: 0.2, y: 0.3 },
          { x: 0.7, y: 0.8 },
        ],
      }),
    );
    expect(state.autopilot.phase).toBe("paused_by_human");
    expect(state.autopilot.banner).toBe("paused");
    expect(state.strokes[0]?.cardId).toBe(canvasCardId);
    expect(state.strokes[0]?.points).toHaveLength(2);
  });

  it("ignores an unknown card and clears only the pinned card", () => {
    const seeded = createSampleWorkspace();
    const ignored = assertCommit(
      appendSketchStroke(seeded, seeded.stateVersion, {
        cardId: "card-missing",
        points: ink,
      }),
    );
    expect(ignored.stateVersion).toBe(0);
    expect(ignored.strokes).toEqual([]);
    const drawn = assertCommit(
      appendSketchStroke(seeded, seeded.stateVersion, { cardId: canvasCardId, points: ink }),
    );
    const kept = assertCommit(clearSketchStrokes(drawn, drawn.stateVersion, "card-bridge"));
    expect(kept.strokes).toHaveLength(1);
    expect(kept.stateVersion).toBe(drawn.stateVersion);
    const cleared = assertCommit(clearSketchStrokes(drawn, drawn.stateVersion, canvasCardId));
    expect(cleared.strokes).toEqual([]);
    expect(cleared.stateVersion).toBe(drawn.stateVersion + 1);
  });

  it("hydrates a pre-stroke workspace and keeps its cards, version, and log", () => {
    const current = createSampleWorkspace();
    const legacy = {
      ...current,
      stateVersion: 4,
      logSeq: 2,
      problemCards: current.problemCards.map((card) =>
        card.id === canvasCardId ? { ...card, statement: "Kept from main." } : card,
      ),
      eventLog: [
        ...current.eventLog,
        {
          id: "log-2",
          stateVersion: 4,
          kind: "human" as const,
          message: "Human edit recorded",
        },
      ],
    };
    const withoutStrokes: Record<string, unknown> = { ...legacy };
    delete withoutStrokes.strokes;
    const raw = JSON.stringify(withoutStrokes);
    expect(raw.includes("strokes")).toBe(false);
    const restored = readPersistedWorkspace(raw);
    const again = readPersistedWorkspace(raw);
    expect(restored?.strokes).toEqual([]);
    expect(again?.strokes).toEqual([]);
    expect(restored?.strokes).not.toBe(again?.strokes);
    expect(restored?.stateVersion).toBe(4);
    expect(restored?.logSeq).toBe(2);
    expect(restored?.problemCards.find((card) => card.id === canvasCardId)?.statement).toBe(
      "Kept from main.",
    );
    expect(restored?.eventLog.map((entry) => entry.id)).toEqual(["log-1", "log-2"]);
    expect(restored?.autopilot.phase).toBe(current.autopilot.phase);
  });

  it("round-trips strokes through the workspace store and drops a corrupt payload", () => {
    const drawn = assertCommit(
      appendSketchStroke(createSampleWorkspace(), 0, { cardId: canvasCardId, points: ink }),
    );
    const restored = readPersistedWorkspace(serializeWorkspace(drawn));
    expect(restored?.strokes).toEqual(drawn.strokes);
    expect(restored?.stateVersion).toBe(drawn.stateVersion);
    expect(readPersistedWorkspace("not-json")).toBeNull();
    expect(readPersistedWorkspace(JSON.stringify({ stateVersion: 0 }))).toBeNull();
  });
});
