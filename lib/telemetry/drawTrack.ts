import { Point, TrackGeometry } from "@/lib/telemetry/geometry";

/** Space round the circuit inside the track map canvas; the intro's track lands on the same fit. */
export const TRACK_MAP_PADDING = 40;

// Share of a lap over which a corner number fades in once the drawn line reaches it.
const CORNER_FADE = 0.03;

export interface TrackReveal {
  /** Share of the lap drawn so far, from the start/finish line (0–1). */
  drawn: number;
  /** Extra red glow on the start/finish line (0–1). */
  startGlow: number;
}

const FULLY_DRAWN: TrackReveal = { drawn: 1, startGlow: 0 };

function perimeter(points: Point[]): number {
  let length = 0;
  points.forEach((p, i) => {
    const next = points[(i + 1) % points.length];
    length += Math.hypot(next.x - p.x, next.y - p.y);
  });
  return length;
}

/** Paints the circuit as the track map shows it; `reveal` lets the intro draw it on lap by lap. */
export function drawTrack(
  ctx: CanvasRenderingContext2D,
  track: TrackGeometry,
  toScreen: (p: Point) => Point,
  fontFamily: string,
  reveal: TrackReveal = FULLY_DRAWN
) {
  const points = track.outline.map(toScreen);
  const path = new Path2D();
  points.forEach((p, i) => (i === 0 ? path.moveTo(p.x, p.y) : path.lineTo(p.x, p.y)));
  path.closePath();

  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(255, 255, 255, 0.07)";
  ctx.lineWidth = 16;
  ctx.stroke(path);

  if (reveal.drawn > 0) {
    if (reveal.drawn < 1) {
      const length = perimeter(points);
      ctx.setLineDash([reveal.drawn * length, length]);
    }
    ctx.shadowColor = "rgba(255, 255, 255, 0.6)";
    ctx.shadowBlur = 14;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.92)";
    ctx.lineWidth = 3.5;
    ctx.stroke(path);
    ctx.shadowBlur = 0;
    ctx.setLineDash([]);
  }

  // Start/finish line: a short bar across the track at the first outline point.
  if (points.length > 1) {
    const [a, b] = points;
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const nx = -(b.y - a.y) / len;
    const ny = (b.x - a.x) / len;
    if (reveal.startGlow > 0) {
      ctx.shadowColor = `rgba(255, 40, 20, ${reveal.startGlow})`;
      ctx.shadowBlur = 24 * reveal.startGlow;
    }
    ctx.strokeStyle = "#e10600";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(a.x - nx * 9, a.y - ny * 9);
    ctx.lineTo(a.x + nx * 9, a.y + ny * 9);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  ctx.font = `600 10px ${fontFamily}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const corner of track.corners) {
    const alpha = reveal.drawn >= 1 ? 1 : Math.min(Math.max((reveal.drawn - corner.progress) / CORNER_FADE, 0), 1);
    if (alpha === 0) continue;
    const p = toScreen(corner);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
    ctx.fillText(String(corner.number), p.x, p.y + 0.5);
  }
  ctx.globalAlpha = 1;
}
