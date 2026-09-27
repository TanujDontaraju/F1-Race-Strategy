// Comparing single laps: which lap each driver is shown with, and how their
// telemetry lines up against distance round the lap.

import { SessionTimeline, TimedLap } from "@/lib/telemetry/derive";
import { LapTelemetry } from "@/lib/telemetry/types";

/** Mini-sectors the lap is cut into for the dominance map. */
export const MINI_SECTORS = 18;

/** A driver's quickest timed lap. */
export function fastestLapOf(timeline: SessionTimeline, driver: number): TimedLap | null {
  let best: TimedLap | null = null;
  for (const lap of timeline.laps.get(driver) ?? []) {
    if (lap.duration != null && (!best || lap.duration < best.duration!)) best = lap;
  }
  return best;
}

export function lapOf(timeline: SessionTimeline, driver: number, lap: number): TimedLap | null {
  return (timeline.laps.get(driver) ?? []).find((l) => l.lap === lap) ?? null;
}

/** Index of the last element <= value in an ascending array (0 when value is below the first). */
function floorIndex(values: number[], value: number): number {
  let lo = 0;
  let hi = values.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (values[mid] <= value) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Linear interpolation of ys at x, holding the end values outside the range. */
export function interpolate(xs: number[], ys: number[], x: number): number {
  if (xs.length === 0) return NaN;
  if (x <= xs[0]) return ys[0];
  if (x >= xs[xs.length - 1]) return ys[ys.length - 1];
  const i = floorIndex(xs, x);
  const span = xs[i + 1] - xs[i];
  return span > 0 ? ys[i] + ((ys[i + 1] - ys[i]) * (x - xs[i])) / span : ys[i];
}

/** The sample nearest to x, for readouts of stepped channels like gear. */
export function nearest(xs: number[], ys: number[], x: number): number {
  if (xs.length === 0) return NaN;
  const i = floorIndex(xs, x);
  return i + 1 < xs.length && Math.abs(xs[i + 1] - x) < Math.abs(xs[i] - x) ? ys[i + 1] : ys[i];
}

/**
 * Laps differ by a few metres (lines taken, the odd trip off track), so every lap
 * is stretched onto the reference length: corners line up across drivers.
 */
export function scaleTo(distance: number[], length: number, reference: number): number[] {
  const k = length > 0 ? reference / length : 1;
  return distance.map((d) => d * k);
}

/** Seconds spent in each of `count` equal slices of the lap. */
export function miniSectorTimes(tel: LapTelemetry, count = MINI_SECTORS): number[] {
  const { distance, time } = tel.path;
  const at = (fraction: number) => interpolate(distance, time, fraction * tel.length);
  return Array.from({ length: count }, (_, i) => at((i + 1) / count) - at(i / count));
}

/** For each mini-sector, the index of whichever lap was quickest through it. */
export function dominance(laps: LapTelemetry[], count = MINI_SECTORS): number[] {
  const times = laps.map((tel) => miniSectorTimes(tel, count));
  return Array.from({ length: count }, (_, s) => {
    let best = 0;
    times.forEach((t, i) => {
      if (t[s] < times[best][s]) best = i;
    });
    return best;
  });
}

/**
 * Time gained or lost to the reference lap along the way, in seconds (positive is
 * behind), sampled every `step` metres of the reference lap.
 */
export function deltaTrace(tel: LapTelemetry, reference: LapTelemetry, step = 10): { distance: number[]; delta: number[] } {
  const own = scaleTo(tel.path.distance, tel.length, reference.length);
  const distance: number[] = [];
  const delta: number[] = [];
  for (let d = 0; d <= reference.length; d += step) {
    distance.push(d);
    delta.push(interpolate(own, tel.path.time, d) - interpolate(reference.path.distance, reference.path.time, d));
  }
  return { distance, delta };
}
