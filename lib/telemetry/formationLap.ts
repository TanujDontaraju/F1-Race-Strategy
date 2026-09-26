import { Point } from "@/lib/telemetry/geometry";

// A plausible lap rather than a recorded one: corner speed comes from the
// radius of each bend, then braking and traction limits shape how the car
// gets there, so it slows into corners and fires out of them. Outline units
// are MultiViewer's decimetres; the result is time-lapsed to LAP_SECONDS.
const UNITS_PER_METRE = 10;
const SAMPLES = 720;
const CURVE_WINDOW_M = 12;
const LATERAL_GRIP = 30; // m/s²
const BRAKING = 45; // m/s²
const TRACTION = 12; // m/s²
const TOP_SPEED = 92; // m/s
const MIN_SPEED = 16; // m/s
const LAP_SECONDS = 3.2;

export interface FormationLap {
  /** Lap length in world units. */
  length: number;
  pointAt: (distance: number) => Point;
  /** Seconds the opening lap takes (it starts from a standstill on the line). */
  firstLapSeconds: number;
  /** Seconds each flying lap after that takes. */
  lapSeconds: number;
  /** Distance round the lap after `seconds` of the opening lap. */
  firstLapDistance: (seconds: number) => number;
  /** Distance round the lap after `seconds` of a flying lap. */
  lapDistance: (seconds: number) => number;
}

function turnAngle(ax: number, ay: number, bx: number, by: number): number {
  return Math.abs(Math.atan2(ax * by - ay * bx, ax * bx + ay * by));
}

function search(values: number[], target: number): number {
  let lo = 0;
  let hi = values.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (values[mid] <= target) lo = mid;
    else hi = mid;
  }
  return lo;
}

export function buildFormationLap(outline: Point[]): FormationLap {
  const loop = [...outline, outline[0]];
  const travelled = [0];
  for (let i = 1; i < loop.length; i++) {
    travelled.push(travelled[i - 1] + Math.hypot(loop[i].x - loop[i - 1].x, loop[i].y - loop[i - 1].y));
  }
  const length = travelled[travelled.length - 1] || 1;

  const pointAt = (distance: number): Point => {
    const d = ((distance % length) + length) % length;
    const i = search(travelled, d);
    const a = loop[i];
    const b = loop[Math.min(i + 1, loop.length - 1)];
    const t = (d - travelled[i]) / (travelled[i + 1] - travelled[i] || 1);
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  };

  // Resample evenly so the outline's uneven (and sometimes duplicated) points don't skew curvature.
  const step = length / SAMPLES;
  const stepMetres = step / UNITS_PER_METRE;
  const samples = Array.from({ length: SAMPLES }, (_, i) => pointAt(i * step));
  const reach = Math.max(1, Math.round((CURVE_WINDOW_M * UNITS_PER_METRE) / step));

  const flying = samples.map((p, i) => {
    const before = samples[(i - reach + SAMPLES) % SAMPLES];
    const after = samples[(i + reach) % SAMPLES];
    const turn = turnAngle(p.x - before.x, p.y - before.y, after.x - p.x, after.y - p.y);
    const radius = (2 * reach * stepMetres) / Math.max(turn, 1e-6);
    return Math.min(TOP_SPEED, Math.max(MIN_SPEED, Math.sqrt(LATERAL_GRIP * radius)));
  });
  // Twice round, so the limits carry across the start/finish line.
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < SAMPLES; i++) {
      const next = (i + 1) % SAMPLES;
      flying[next] = Math.min(flying[next], Math.sqrt(flying[i] ** 2 + 2 * TRACTION * stepMetres));
    }
    for (let i = SAMPLES - 1; i >= 0; i--) {
      const next = (i + 1) % SAMPLES;
      flying[i] = Math.min(flying[i], Math.sqrt(flying[next] ** 2 + 2 * BRAKING * stepMetres));
    }
  }

  // Speeds at every sample boundary, including the return to the line.
  const flyingSpeeds = [...flying, flying[0]];
  const standingSpeeds = [0];
  for (let i = 1; i <= SAMPLES; i++) {
    standingSpeeds.push(Math.min(flyingSpeeds[i], Math.sqrt(standingSpeeds[i - 1] ** 2 + 2 * TRACTION * stepMetres)));
  }

  const clockFor = (speeds: number[]) => {
    const clock = [0];
    for (let i = 0; i < SAMPLES; i++) clock.push(clock[i] + (2 * stepMetres) / (speeds[i] + speeds[i + 1]));
    return clock;
  };
  const flyingClock = clockFor(flyingSpeeds);
  const standingClock = clockFor(standingSpeeds);
  const timeLapse = LAP_SECONDS / flyingClock[SAMPLES];

  const distanceFor = (clock: number[]) => (seconds: number) => {
    const t = Math.min(Math.max(seconds / timeLapse, 0), clock[SAMPLES]);
    const i = Math.min(search(clock, t), SAMPLES - 1);
    return (i + (t - clock[i]) / (clock[i + 1] - clock[i])) * step;
  };

  return {
    length,
    pointAt,
    firstLapSeconds: standingClock[SAMPLES] * timeLapse,
    lapSeconds: LAP_SECONDS,
    firstLapDistance: distanceFor(standingClock),
    lapDistance: distanceFor(flyingClock),
  };
}
