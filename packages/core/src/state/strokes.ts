import { SketchPointSchema, SketchStrokeSchema, type SketchPoint, type WorkspaceState } from "./schema.js";
import { commitHuman, type CommitResult } from "./store.js";

function sameOrConflict(state: WorkspaceState, expectedVersion: number): CommitResult {
  if (expectedVersion !== state.stateVersion) {
    return {
      ok: false,
      error: {
        code: "STATE_CONFLICT",
        expectedVersion,
        actualVersion: state.stateVersion,
      },
    };
  }
  return { ok: true, state };
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return Number.NaN;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

export function normalizeSketchPoints(points: readonly SketchPoint[]): SketchPoint[] {
  const normalized: SketchPoint[] = [];
  for (const point of points) {
    const x = clampUnit(point.x);
    const y = clampUnit(point.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const next: SketchPoint = { x, y };
    if (point.pressure !== undefined && Number.isFinite(point.pressure)) {
      next.pressure = clampUnit(point.pressure);
    }
    normalized.push(SketchPointSchema.parse(next));
  }
  return normalized;
}

export function appendSketchStroke(
  state: WorkspaceState,
  expectedVersion: number,
  input: { cardId: string; points: readonly SketchPoint[] },
): CommitResult {
  const points = normalizeSketchPoints(input.points);
  const ownsCard = state.problemCards.some((card) => card.id === input.cardId);
  if (!ownsCard || points.length === 0) return sameOrConflict(state, expectedVersion);
  return commitHuman(state, expectedVersion, (draft) => ({
    ...draft,
    strokes: [
      ...draft.strokes,
      SketchStrokeSchema.parse({
        id: `stroke-${draft.logSeq + 1}`,
        cardId: input.cardId,
        points,
      }),
    ],
  }));
}

export function clearSketchStrokes(
  state: WorkspaceState,
  expectedVersion: number,
  cardId: string,
): CommitResult {
  if (!state.strokes.some((stroke) => stroke.cardId === cardId)) {
    return sameOrConflict(state, expectedVersion);
  }
  return commitHuman(state, expectedVersion, (draft) => ({
    ...draft,
    strokes: draft.strokes.filter((stroke) => stroke.cardId !== cardId),
  }));
}
