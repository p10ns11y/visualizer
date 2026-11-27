import type { SketchPoint } from "@visualizer/core";
import { getStroke } from "perfect-freehand";

export const SKETCH_WIDTH = 100;
export const SKETCH_HEIGHT = 64;

function outlinePath(points: ReadonlyArray<readonly [number, number]>): string {
  const first = points[0];
  if (!first) return "";
  if (points.length === 1) {
    const radius = 1.2;
    return `M ${first[0] - radius} ${first[1]} a ${radius} ${radius} 0 1 0 ${radius * 2} 0 a ${radius} ${radius} 0 1 0 ${-radius * 2} 0`;
  }
  let path = `M ${first[0]} ${first[1]} Q`;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    if (!current || !next) continue;
    path += ` ${current[0]} ${current[1]} ${(current[0] + next[0]) / 2} ${(current[1] + next[1]) / 2}`;
  }
  return `${path} Z`;
}

export function sketchPath(points: readonly SketchPoint[]): string {
  if (points.length === 0) return "";
  const hasPressure = points.every((point) => point.pressure !== undefined);
  const outline = getStroke(
    points.map((point) =>
      hasPressure
        ? [point.x * SKETCH_WIDTH, point.y * SKETCH_HEIGHT, point.pressure ?? 0]
        : [point.x * SKETCH_WIDTH, point.y * SKETCH_HEIGHT],
    ),
    {
      size: 3.6,
      thinning: 0.55,
      smoothing: 0.55,
      streamline: 0.5,
      simulatePressure: !hasPressure,
      start: { cap: true, taper: 0 },
      end: { cap: true, taper: 8 },
    },
  );
  return outlinePath(outline);
}
