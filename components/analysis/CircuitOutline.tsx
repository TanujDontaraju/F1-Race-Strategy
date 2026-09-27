import { useMemo } from "react";
import { Point, TrackGeometry } from "@/lib/telemetry/geometry";

/** Share of the track's span left clear round the outline. */
const PADDING = 0.06;

/** The outline as SVG points (y flipped so north stays up), plus its viewBox. */
export function useOutline(track: TrackGeometry) {
  return useMemo(() => {
    const { minX, maxX, minY, maxY } = track.bounds;
    const span = Math.max(maxX - minX, maxY - minY);
    const pad = span * PADDING;
    const points: Point[] = track.outline.map((p) => ({ x: p.x - minX + pad, y: maxY - p.y + pad }));
    const viewBox = `0 0 ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`;
    // One hundredth of the drawing, for sizing marks in world units.
    return { points, viewBox, unit: span / 100 };
  }, [track]);
}

export const toPath = (points: Point[], close = false) =>
  points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(0)},${p.y.toFixed(0)}`).join("") + (close ? "Z" : "");

/** A small static drawing of the circuit, with the start/finish line in red. */
export default function CircuitOutline({ track, className = "" }: { track: TrackGeometry; className?: string }) {
  const { points, viewBox, unit } = useOutline(track);
  const start = points[0];
  return (
    <svg viewBox={viewBox} className={className} role="img" aria-label="Circuit layout">
      <path
        d={toPath(points, true)}
        fill="none"
        stroke="rgba(255,255,255,0.85)"
        strokeWidth={2.5}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {start && (
        <circle cx={start.x} cy={start.y} r={unit * 2.5} fill="var(--f1-red)">
          <title>Start / finish</title>
        </circle>
      )}
    </svg>
  );
}
