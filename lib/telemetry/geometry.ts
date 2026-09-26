import { CircuitLayout } from "@/lib/telemetry/types";

export interface Point {
  x: number;
  y: number;
}

export interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface TrackGeometry {
  /** Outline in rotated world units, in driving order (index 0 is the start/finish line). */
  outline: Point[];
  /** Corner-number label positions; `progress` is how far round the lap (0–1) the corner sits. */
  corners: { number: number; x: number; y: number; progress: number }[];
  bounds: Bounds;
  toWorld: (x: number, y: number) => Point;
}

/** Where a uniformly scaled track sits on screen: the centre of its bounds, and pixels per world unit. */
export interface ScreenFit {
  x: number;
  y: number;
  scale: number;
}

// Distance of corner-number labels from the racing line, as a fraction of the track's span.
const CORNER_LABEL_OFFSET = 0.035;

function boundsOf(points: Point[]): Bounds {
  const bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  for (const p of points) {
    bounds.minX = Math.min(bounds.minX, p.x);
    bounds.maxX = Math.max(bounds.maxX, p.x);
    bounds.minY = Math.min(bounds.minY, p.y);
    bounds.maxY = Math.max(bounds.maxY, p.y);
  }
  return bounds;
}

/**
 * Car positions and the circuit outline share one flat, right-handed (y-up)
 * coordinate system, so both go through the same rotation. `rotation` is
 * MultiViewer's display orientation for the circuit, in degrees.
 */
export function buildTrackGeometry(layout: CircuitLayout): TrackGeometry {
  const raw = layout.x.map((x, i) => ({ x, y: layout.y[i] }));
  const rawBounds = boundsOf(raw);
  const cx = (rawBounds.minX + rawBounds.maxX) / 2;
  const cy = (rawBounds.minY + rawBounds.maxY) / 2;
  const angle = (layout.rotation * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  const toWorld = (x: number, y: number): Point => ({
    x: cx + (x - cx) * cos - (y - cy) * sin,
    y: cy + (x - cx) * sin + (y - cy) * cos,
  });

  const outline = raw.map((p) => toWorld(p.x, p.y));
  const span = Math.max(rawBounds.maxX - rawBounds.minX, rawBounds.maxY - rawBounds.minY);
  const offset = span * CORNER_LABEL_OFFSET;

  const travelled = [0];
  for (let i = 1; i < raw.length; i++) {
    travelled.push(travelled[i - 1] + Math.hypot(raw[i].x - raw[i - 1].x, raw[i].y - raw[i - 1].y));
  }
  const last = raw[raw.length - 1];
  const lapLength = travelled[travelled.length - 1] + Math.hypot(raw[0].x - last.x, raw[0].y - last.y) || 1;

  const corners = layout.corners.map((corner) => {
    const a = (corner.angle * Math.PI) / 180;
    const p = toWorld(
      corner.trackPosition.x + offset * Math.cos(a),
      corner.trackPosition.y + offset * Math.sin(a)
    );
    let nearest = 0;
    let nearestDistance = Infinity;
    raw.forEach((q, i) => {
      const d = (q.x - corner.trackPosition.x) ** 2 + (q.y - corner.trackPosition.y) ** 2;
      if (d < nearestDistance) {
        nearestDistance = d;
        nearest = i;
      }
    });
    return { number: corner.number, ...p, progress: travelled[nearest] / lapLength };
  });

  return { outline, corners, bounds: boundsOf(outline), toWorld };
}

/** Uniformly scales world bounds into a box (in screen pixels), leaving `padding` round the edge. */
export function fitToBox(
  bounds: Bounds,
  left: number,
  top: number,
  width: number,
  height: number,
  padding: number
): ScreenFit {
  const w = Math.max(bounds.maxX - bounds.minX, 1);
  const h = Math.max(bounds.maxY - bounds.minY, 1);
  return {
    x: left + width / 2,
    y: top + height / 2,
    scale: Math.min((width - padding * 2) / w, (height - padding * 2) / h),
  };
}

/** World → screen for a fit, flipping y so north stays up. */
export function projector(bounds: Bounds, fit: ScreenFit) {
  const midX = (bounds.minX + bounds.maxX) / 2;
  const midY = (bounds.minY + bounds.maxY) / 2;
  return (p: Point): Point => ({
    x: fit.x + (p.x - midX) * fit.scale,
    y: fit.y - (p.y - midY) * fit.scale,
  });
}

export function fitToCanvas(bounds: Bounds, width: number, height: number, padding: number) {
  return projector(bounds, fitToBox(bounds, 0, 0, width, height, padding));
}
