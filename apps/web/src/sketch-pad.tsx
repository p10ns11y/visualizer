import { useRef, useState, type PointerEvent } from "react";
import type { SketchPoint, SketchStroke } from "@visualizer/core";
import { SKETCH_HEIGHT, SKETCH_WIDTH, sketchPath } from "./stroke-path.js";

function dot(point: SketchPoint | undefined): SketchPoint[] {
  if (!point) return [];
  const nudged: SketchPoint = {
    ...point,
    x: point.x > 0.98 ? point.x - 0.012 : Math.min(1, point.x + 0.012),
  };
  return [point, nudged];
}

function pointFrom(bounds: DOMRect, event: { clientX: number; clientY: number; pointerType: string; pressure: number }): SketchPoint {
  const width = bounds.width || 1;
  const height = bounds.height || 1;
  const point: SketchPoint = {
    x: Math.min(1, Math.max(0, (event.clientX - bounds.left) / width)),
    y: Math.min(1, Math.max(0, (event.clientY - bounds.top) / height)),
  };
  if (event.pointerType === "pen" && Number.isFinite(event.pressure)) {
    point.pressure = Math.min(1, Math.max(0, event.pressure));
  }
  return point;
}

function samplesFrom(event: PointerEvent<SVGSVGElement>): SketchPoint[] {
  const bounds = event.currentTarget.getBoundingClientRect();
  const native = event.nativeEvent;
  const coalesced =
    typeof native.getCoalescedEvents === "function" ? native.getCoalescedEvents() : [];
  const events = coalesced.length > 0 ? coalesced : [native];
  return events.map((sample) => pointFrom(bounds, sample));
}

export function SketchPad({
  cardId,
  cardTitle,
  strokes,
  onStroke,
}: {
  cardId: string;
  cardTitle: string;
  strokes: readonly SketchStroke[];
  onStroke: (cardId: string, points: SketchPoint[]) => void;
}) {
  const pinned = strokes.filter((stroke) => stroke.cardId === cardId);
  const active = useRef<number | null>(null);
  const draft = useRef<SketchPoint[]>([]);
  const [live, setLive] = useState<SketchPoint[] | null>(null);

  function finish(pointerId: number) {
    if (active.current !== pointerId) return;
    active.current = null;
    const drawn = draft.current;
    draft.current = [];
    setLive(null);
    if (drawn.length === 0) return;
    const points = drawn.length === 1 ? dot(drawn[0]) : drawn;
    onStroke(cardId, points);
  }

  function onPointerDown(event: PointerEvent<SVGSVGElement>) {
    if (typeof event.currentTarget.setPointerCapture === "function") {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    active.current = event.pointerId;
    draft.current = samplesFrom(event);
    setLive(draft.current);
  }

  function onPointerMove(event: PointerEvent<SVGSVGElement>) {
    if (active.current !== event.pointerId) return;
    draft.current = [...draft.current, ...samplesFrom(event)];
    setLive(draft.current);
  }

  return (
    <div className="sketch">
      <p className="pin">
        {pinned.length} {pinned.length === 1 ? "stroke" : "strokes"} pinned to {cardTitle}
      </p>
      <svg
        className="sketch-pad"
        data-sketch={cardId}
        viewBox={`0 0 ${SKETCH_WIDTH} ${SKETCH_HEIGHT}`}
        preserveAspectRatio="none"
        aria-label={`Sketch surface for ${cardTitle}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(event) => finish(event.pointerId)}
        onPointerCancel={(event) => finish(event.pointerId)}
      >
        {pinned.map((stroke) => (
          <path key={stroke.id} d={sketchPath(stroke.points)} />
        ))}
        {live && live.length > 0 ? <path d={sketchPath(live)} data-live="true" /> : null}
      </svg>
    </div>
  );
}
