// Whole-session summaries for the analysis views, built from the data the
// store already holds for replay. Times are epoch ms; durations are seconds.

import { intervalAt, positionAt, SessionTimeline, TimedLap, tyreAt } from "@/lib/telemetry/derive";
import { parseDate } from "@/lib/telemetry/format";
import {
  Driver,
  GapValue,
  GridRow,
  KnockoutRow,
  PitRow,
  RetirementRow,
  StintRow,
  TrackStatusRow,
  WeatherRow,
} from "@/lib/telemetry/types";

const byNumber = (drivers: Driver[]) => new Map(drivers.map((d) => [d.driver_number, d]));

/** Drivers in their order at `time` (the classification when `time` is the end of the session). */
export function classification(timeline: SessionTimeline, drivers: Driver[], time: number): Driver[] {
  const at = (d: Driver) => positionAt(timeline, d.driver_number, time) ?? 99;
  return [...drivers].sort((a, b) => at(a) - at(b) || a.driver_number - b.driver_number);
}

function timedLaps(timeline: SessionTimeline, driver: number): TimedLap[] {
  return (timeline.laps.get(driver) ?? []).filter((l) => l.duration != null && l.end != null);
}

function stintsOf(timeline: SessionTimeline, driver: number): StintRow[] {
  return timeline.stints.get(driver) ?? [];
}

/** When each lap began: the leader starts every lap first. */
export function lapStarts(timeline: SessionTimeline): Map<number, number> {
  const starts = new Map<number, number>();
  for (const laps of timeline.laps.values()) {
    for (const lap of laps) starts.set(lap.lap, Math.min(starts.get(lap.lap) ?? Infinity, lap.start));
  }
  return starts;
}

// --- race -----------------------------------------------------------------

export interface RaceResultRow {
  driver: Driver;
  position: number | null;
  /** Gap to the winner, "+1 LAP", or null for the winner. */
  gap: GapValue;
  retiredOnLap: number | null;
  grid: number | null;
  /** Places gained from the grid (negative when lost). */
  gained: number | null;
  compounds: (string | null)[];
  pitStops: number;
  laps: number;
}

export function raceResults(
  timeline: SessionTimeline,
  drivers: Driver[],
  grid: GridRow[],
  retirements: RetirementRow[],
  pits: PitRow[],
  end: number
): RaceResultRow[] {
  const gridOf = new Map(grid.map((g) => [g.driver_number, g.position]));
  const retired = new Map(retirements.map((r) => [r.driver_number, r.lap_number]));
  return classification(timeline, drivers, end).map((driver) => {
    const n = driver.driver_number;
    const position = positionAt(timeline, n, end);
    const start = gridOf.get(n) ?? null;
    const gap = intervalAt(timeline, n, end)?.gap ?? null;
    return {
      driver,
      position,
      gap: retired.has(n) ? "OUT" : gap,
      retiredOnLap: retired.get(n) ?? null,
      grid: start,
      gained: start != null && position != null ? start - position : null,
      compounds: stintsOf(timeline, n).map((s) => s.compound),
      pitStops: pits.filter((p) => p.driver_number === n).length,
      laps: timedLaps(timeline, n).length,
    };
  });
}

/** Neutralised periods, from each deployment until the track goes green (yellows don't end them). */
function periods(trackStatus: TrackStatusRow[], active: (status: string) => boolean): [number, number][] {
  const spans: [number, number][] = [];
  let from: number | null = null;
  for (const row of trackStatus) {
    const t = parseDate(row.date);
    if (active(row.status)) from ??= t;
    else if (from != null && row.status !== "Yellow") {
      spans.push([from, t]);
      from = null;
    }
  }
  if (from != null) spans.push([from, Infinity]);
  return spans;
}

/** Laps that began under a safety car or virtual safety car. */
export function neutralisedLaps(timeline: SessionTimeline, trackStatus: TrackStatusRow[]) {
  const sc = periods(trackStatus, (s) => s === "SCDeployed");
  const vsc = periods(trackStatus, (s) => s === "VSCDeployed" || s === "VSCEnding");
  const inside = (spans: [number, number][], t: number) => spans.some(([a, b]) => t >= a && t < b);
  let safetyCar = 0;
  let virtual = 0;
  for (const start of lapStarts(timeline).values()) {
    if (inside(sc, start)) safetyCar++;
    else if (inside(vsc, start)) virtual++;
  }
  return { safetyCar, virtual };
}

/**
 * Places gained on track: pairs of cars that swap order from one lap to the
 * next, ignoring laps where either pitted and cars that have retired. Counting
 * lap to lap rather than every timing-point swap avoids double counting cars
 * that trade places and back.
 */
export function onTrackOvertakes(
  timeline: SessionTimeline,
  drivers: Driver[],
  pits: PitRow[],
  retirements: RetirementRow[]
): number {
  const pitLaps = new Map<number, Set<number>>();
  for (const p of pits) pitLaps.set(p.driver_number, (pitLaps.get(p.driver_number) ?? new Set()).add(p.lap_number));
  const out = new Map(retirements.map((r) => [r.driver_number, parseDate(r.date)]));
  const starts = [...lapStarts(timeline).entries()].sort((a, b) => a[0] - b[0]);

  let count = 0;
  for (let i = 1; i < starts.length; i++) {
    const [lap, t1] = starts[i];
    const t0 = starts[i - 1][1];
    const pitted = (n: number) => pitLaps.get(n)?.has(lap) || pitLaps.get(n)?.has(lap - 1);
    const racing = drivers
      .map((d) => d.driver_number)
      .filter((n) => !pitted(n) && !((out.get(n) ?? Infinity) <= t1));
    for (const a of racing) {
      for (const b of racing) {
        const a0 = positionAt(timeline, a, t0);
        const b0 = positionAt(timeline, b, t0);
        const a1 = positionAt(timeline, a, t1);
        const b1 = positionAt(timeline, b, t1);
        if (a0 != null && b0 != null && a1 != null && b1 != null && a0 > b0 && a1 < b1) count++;
      }
    }
  }
  return count;
}

export interface FastestLap {
  driver: Driver;
  duration: number;
  lap: number;
}

export function fastestLap(timeline: SessionTimeline, drivers: Driver[]): FastestLap | null {
  const lookup = byNumber(drivers);
  let fastest: FastestLap | null = null;
  for (const [n, laps] of timeline.laps) {
    const driver = lookup.get(n);
    if (!driver) continue;
    for (const lap of laps) {
      if (lap.duration != null && (!fastest || lap.duration < fastest.duration)) fastest = { driver, duration: lap.duration, lap: lap.lap };
    }
  }
  return fastest;
}

export interface RaceStats {
  fastestLap: FastestLap | null;
  winnerTime: number | null;
  laps: number;
  retirements: number;
  overtakes: number;
  pitStops: number;
  quickestStop: { driver: Driver; duration: number } | null;
  safetyCarLaps: number;
  vscLaps: number;
}

export function raceStats(
  timeline: SessionTimeline,
  drivers: Driver[],
  trackStatus: TrackStatusRow[],
  pits: PitRow[],
  retirements: RetirementRow[],
  end: number
): RaceStats {
  const lookup = byNumber(drivers);
  const raceStart = timeline.phases[0]?.start ?? null;
  const winner = classification(timeline, drivers, end)[0];
  const winnerLaps = winner ? timedLaps(timeline, winner.driver_number) : [];
  const lastLap = winnerLaps.at(-1);
  const stops = pits.filter((p) => p.stop_duration != null);
  const quickest = stops.reduce<PitRow | null>((best, p) => (!best || p.stop_duration! < best.stop_duration! ? p : best), null);
  const { safetyCar, virtual } = neutralisedLaps(timeline, trackStatus);

  return {
    fastestLap: fastestLap(timeline, drivers),
    winnerTime: raceStart != null && lastLap?.end != null ? (lastLap.end - raceStart) / 1000 : null,
    laps: lastLap?.lap ?? 0,
    retirements: retirements.length,
    overtakes: onTrackOvertakes(timeline, drivers, pits, retirements),
    pitStops: pits.length,
    quickestStop: quickest && lookup.has(quickest.driver_number)
      ? { driver: lookup.get(quickest.driver_number)!, duration: quickest.stop_duration! }
      : null,
    safetyCarLaps: safetyCar,
    vscLaps: virtual,
  };
}

// --- qualifying -----------------------------------------------------------

export interface QualifyingRow {
  driver: Driver;
  best: number | null;
  gap: number | null;
  laps: number;
  eliminated: boolean;
}

export interface QualifyingPart {
  number: number;
  rows: QualifyingRow[];
}

/**
 * Q1/Q2/Q3, each ranked on its own laps. F1 flags who was knocked out as each
 * part ends, so a driver who went through but didn't run (a crash, a saved
 * set of tyres) still appears in the next part, without a time.
 */
export function qualifyingParts(timeline: SessionTimeline, drivers: Driver[], knockouts: KnockoutRow[]): QualifyingPart[] {
  const phases = timeline.phases.filter((p) => p.number != null);
  const bounds = phases.map((phase, i) => [phase.start, phases[i + 1]?.start ?? Infinity] as const);
  const lapsIn = (n: number, [from, until]: readonly [number, number]) =>
    (timeline.laps.get(n) ?? []).filter((l) => l.start >= from && l.start < until);

  // The last part each driver took part in.
  const knockedOut = new Map(knockouts.map((k) => [k.driver_number, parseDate(k.date)]));
  const lastPart = (n: number): number => {
    const out = knockedOut.get(n);
    if (out != null) {
      const i = bounds.findIndex(([from, until]) => out >= from && out < until);
      return i >= 0 ? i : 0;
    }
    if (knockedOut.size > 0) return bounds.length - 1;
    // No flags (an older or partial recording): the last part they set a lap in.
    return bounds.findLastIndex((b) => lapsIn(n, b).length > 0);
  };

  return bounds.map((b, i) => {
    const rows = drivers
      .filter((d) => lastPart(d.driver_number) >= i)
      .map((driver) => {
        const laps = lapsIn(driver.driver_number, b);
        const times = laps.map((l) => l.duration).filter((d): d is number => d != null);
        return { driver, best: times.length ? Math.min(...times) : null, laps: times.length };
      });
    const fastest = Math.min(...rows.map((r) => r.best ?? Infinity));
    return {
      number: phases[i].number!,
      rows: rows
        .map((r) => ({
          ...r,
          gap: r.best != null && Number.isFinite(fastest) ? r.best - fastest : null,
          eliminated: i < bounds.length - 1 && lastPart(r.driver.driver_number) === i,
        }))
        // Through to the next part first, each group in lap-time order.
        .sort((a, b) => Number(a.eliminated) - Number(b.eliminated) || (a.best ?? Infinity) - (b.best ?? Infinity)),
    };
  });
}

// --- practice -------------------------------------------------------------

export interface PracticeRow {
  driver: Driver;
  best: number | null;
  gap: number | null;
  laps: number;
  /** Mean of laps within 107% of the driver's best: their representative pace, not out-laps and cool-downs. */
  representative: number | null;
  compounds: (string | null)[];
}

export function practiceRankings(timeline: SessionTimeline, drivers: Driver[]): PracticeRow[] {
  const rows = drivers.map((driver) => {
    const laps = timedLaps(timeline, driver.driver_number);
    const times = laps.map((l) => l.duration!);
    const best = times.length ? Math.min(...times) : null;
    const clean = best == null ? [] : times.filter((t) => t <= best * 1.07);
    return {
      driver,
      best,
      laps: (timeline.laps.get(driver.driver_number) ?? []).length,
      representative: clean.length ? clean.reduce((a, b) => a + b, 0) / clean.length : null,
      compounds: [...new Set(stintsOf(timeline, driver.driver_number).map((s) => s.compound))],
    };
  });
  rows.sort((a, b) => (a.best ?? Infinity) - (b.best ?? Infinity));
  const fastest = rows[0]?.best ?? null;
  return rows.map((r) => ({ ...r, gap: r.best != null && fastest != null ? r.best - fastest : null }));
}

export interface SessionFacts {
  fastestLap: FastestLap | null;
  /** Speed trap, km/h. */
  topSpeed: { driver: Driver; speed: number } | null;
  mostLaps: { driver: Driver; laps: number } | null;
  totalLaps: number;
}

/** Headline numbers for practice and qualifying. */
export function sessionFacts(timeline: SessionTimeline, drivers: Driver[]): SessionFacts {
  let topSpeed: SessionFacts["topSpeed"] = null;
  let mostLaps: SessionFacts["mostLaps"] = null;
  let totalLaps = 0;
  for (const driver of drivers) {
    const laps = timeline.laps.get(driver.driver_number) ?? [];
    totalLaps += laps.length;
    if (laps.length > 0 && (!mostLaps || laps.length > mostLaps.laps)) mostLaps = { driver, laps: laps.length };
    for (const lap of laps) {
      if (lap.speedTrap != null && (!topSpeed || lap.speedTrap > topSpeed.speed)) topSpeed = { driver, speed: lap.speedTrap };
    }
  }
  return { fastestLap: fastestLap(timeline, drivers), topSpeed, mostLaps, totalLaps };
}

// --- conditions -----------------------------------------------------------

export interface WeatherSummary {
  air: number | null;
  track: number | null;
  trackRange: [number, number] | null;
  humidity: number | null;
  /** km/h */
  wind: number | null;
  rained: boolean;
}

/** Conditions at the start, plus how the track temperature moved through the session. */
export function weatherSummary(weather: WeatherRow[], start: number, end: number): WeatherSummary | null {
  const during = weather.filter((w) => {
    const t = parseDate(w.date);
    return t >= start && t <= end;
  });
  const first = during[0] ?? weather.findLast((w) => parseDate(w.date) <= start) ?? weather[0];
  if (!first) return null;
  const tracks = during.map((w) => w.track_temperature).filter((t): t is number => t != null);
  return {
    air: first.air_temperature,
    track: first.track_temperature,
    trackRange: tracks.length ? [Math.min(...tracks), Math.max(...tracks)] : null,
    humidity: first.humidity,
    wind: first.wind_speed == null ? null : first.wind_speed * 3.6,
    rained: during.some((w) => (w.rainfall ?? 0) > 0),
  };
}

// --- race charts ----------------------------------------------------------

export interface LapPoint {
  lap: number;
  /** Seconds; null when the lap wasn't timed. */
  time: number | null;
  /** An in-lap or out-lap. */
  pit: boolean;
  /** Some of the lap ran under the safety car, VSC or a red flag. */
  neutralised: boolean;
  /** At the end of the lap. */
  position: number | null;
  /** Seconds behind the leader at the end of the lap; null when lapped or out. */
  gap: number | null;
  compound: string | null;
}

// Timing updates for a crossing land a moment after the lap ends.
const CROSSING_SETTLE_MS = 500;

/** Every neutralised stretch of the session: safety car, VSC and red flags. */
export function neutralisedPeriods(trackStatus: TrackStatusRow[]): [number, number][] {
  return periods(trackStatus, (s) => s === "SCDeployed" || s === "VSCDeployed" || s === "VSCEnding" || s === "Red");
}

/** One driver's race, lap by lap. */
export function driverLaps(
  timeline: SessionTimeline,
  driver: number,
  pits: PitRow[],
  neutralised: [number, number][]
): LapPoint[] {
  const inLaps = new Set(pits.filter((p) => p.driver_number === driver).map((p) => p.lap_number));
  return (timeline.laps.get(driver) ?? []).map((lap) => {
    const end = lap.end ?? Infinity;
    const at = lap.end == null ? null : lap.end + CROSSING_SETTLE_MS;
    const gap = at == null ? null : intervalAt(timeline, driver, at)?.gap;
    const position = at == null ? null : positionAt(timeline, driver, at);
    return {
      lap: lap.lap,
      time: lap.duration,
      pit: lap.isPitOut || inLaps.has(lap.lap) || inLaps.has(lap.lap - 1),
      neutralised: neutralised.some(([from, to]) => lap.start < to && end > from),
      position,
      gap: position === 1 ? 0 : typeof gap === "number" ? gap : null,
      compound: tyreAt(timeline, driver, lap.lap)?.compound ?? null,
    };
  });
}

/** Racing laps: timed, not the standing start, not in or out of the pits, not neutralised. */
export const isCleanLap = (p: LapPoint) => p.time != null && p.lap > 1 && !p.pit && !p.neutralised;

export interface PaceSummary {
  best: number | null;
  mean: number | null;
  /** Standard deviation of clean laps: lower is more consistent. */
  sd: number | null;
  laps: number;
}

export function paceSummary(points: LapPoint[]): PaceSummary {
  const times = points.filter(isCleanLap).map((p) => p.time!);
  if (times.length === 0) return { best: null, mean: null, sd: null, laps: 0 };
  const mean = times.reduce((a, b) => a + b, 0) / times.length;
  const sd = Math.sqrt(times.reduce((a, t) => a + (t - mean) ** 2, 0) / times.length);
  return { best: Math.min(...times), mean, sd, laps: times.length };
}

export interface PitStopRow {
  driver: Driver;
  lap: number;
  /** Seconds stationary; F1 only publishes it for some stops. */
  stationary: number | null;
  /** Seconds from pit entry to exit. */
  lane: number | null;
  from: string | null;
  to: string | null;
}

export function pitStopRows(timeline: SessionTimeline, drivers: Driver[], pits: PitRow[]): PitStopRow[] {
  const lookup = byNumber(drivers);
  return pits.flatMap((p) => {
    const driver = lookup.get(p.driver_number);
    if (!driver) return [];
    return [{
      driver,
      lap: p.lap_number,
      stationary: p.stop_duration,
      lane: p.lane_duration,
      from: tyreAt(timeline, p.driver_number, p.lap_number)?.compound ?? null,
      to: tyreAt(timeline, p.driver_number, p.lap_number + 1)?.compound ?? null,
    }];
  });
}

export interface CompoundStints {
  compound: string;
  stints: number;
  /** Laps. */
  mean: number;
  longest: { driver: Driver; laps: number };
}

/** How long each compound lasted, across the field. */
export function stintLengths(timeline: SessionTimeline, drivers: Driver[]): CompoundStints[] {
  const byCompound = new Map<string, { driver: Driver; laps: number }[]>();
  for (const driver of drivers) {
    const lastLap = (timeline.laps.get(driver.driver_number) ?? []).at(-1)?.lap;
    for (const stint of stintsOf(timeline, driver.driver_number)) {
      const end = stint.lap_end ?? lastLap;
      if (!stint.compound || end == null || end < stint.lap_start) continue;
      const list = byCompound.get(stint.compound) ?? [];
      list.push({ driver, laps: end - stint.lap_start + 1 });
      byCompound.set(stint.compound, list);
    }
  }
  return [...byCompound].map(([compound, list]) => ({
    compound,
    stints: list.length,
    mean: list.reduce((a, s) => a + s.laps, 0) / list.length,
    longest: list.reduce((a, b) => (b.laps > a.laps ? b : a)),
  }));
}

export interface LapBand {
  from: number;
  to: number;
  kind: "SC" | "VSC" | "Red";
}

const BAND_KINDS: [LapBand["kind"], (status: string) => boolean][] = [
  ["SC", (s) => s === "SCDeployed"],
  ["VSC", (s) => s === "VSCDeployed" || s === "VSCEnding"],
  ["Red", (s) => s === "Red"],
];

/** Which of a driver's laps (normally the winner's) ran under each safety car, VSC or red flag. */
export function neutralisedBands(timeline: SessionTimeline, trackStatus: TrackStatusRow[], driver: number): LapBand[] {
  const laps = timeline.laps.get(driver) ?? [];
  return BAND_KINDS.flatMap(([kind, active]) =>
    periods(trackStatus, active).flatMap(([from, to]) => {
      const during = laps.filter((l) => l.start < to && (l.end ?? Infinity) > from);
      return during.length ? [{ from: during[0].lap, to: during.at(-1)!.lap, kind }] : [];
    })
  );
}

// --- qualifying analysis --------------------------------------------------

/** Final qualifying order: the last part's order, then each earlier part's knockouts. */
export function qualifyingOrder(parts: QualifyingPart[]): Driver[] {
  return parts
    .map((part, i) => (i === parts.length - 1 ? part.rows : part.rows.filter((r) => r.eliminated)))
    .reverse()
    .flat()
    .map((r) => r.driver);
}

export interface QualifyingLap {
  driver: Driver;
  part: number;
  /** When the lap ended. */
  t: number;
  time: number;
}

export interface CutoffLine {
  part: number;
  /** How many go through. */
  places: number;
  points: { t: number; time: number }[];
}

export interface QualifyingTimeline {
  parts: { number: number; start: number; end: number }[];
  laps: QualifyingLap[];
  cutoffs: CutoffLine[];
}

/**
 * Every flying lap through qualifying, and how the time needed to get through
 * moved as laps came in. Out-laps and cool-downs (slower than 107% of the
 * part's best) are left out.
 */
export function qualifyingTimeline(timeline: SessionTimeline, drivers: Driver[], parts: QualifyingPart[]): QualifyingTimeline {
  const phases = timeline.phases.filter((p) => p.number != null);
  const lookup = byNumber(drivers);
  const allEnds = [...timeline.laps.values()].flat().map((l) => l.end ?? 0);
  const spans = phases.map((phase, i) => ({
    number: phase.number!,
    start: phase.start,
    end: phases[i + 1]?.start ?? Math.max(phase.start, ...allEnds),
  }));

  const laps: QualifyingLap[] = [];
  const cutoffs: CutoffLine[] = [];
  spans.forEach((span, i) => {
    const inPart = [...timeline.laps].flatMap(([n, driverLaps]) =>
      driverLaps
        .filter((l) => l.duration != null && l.end != null && l.start >= span.start && l.start < span.end)
        .flatMap((l) => (lookup.has(n) ? [{ driver: lookup.get(n)!, part: span.number, t: l.end!, time: l.duration! }] : []))
    );
    const fastest = Math.min(...inPart.map((l) => l.time));
    const flying = inPart.filter((l) => l.time <= fastest * 1.07);
    laps.push(...flying);

    const places = parts[i]?.rows.filter((r) => !r.eliminated).length ?? 0;
    if (i === spans.length - 1 || places === 0) return;
    const best = new Map<number, number>();
    const points: CutoffLine["points"] = [];
    for (const lap of [...flying].sort((a, b) => a.t - b.t)) {
      const n = lap.driver.driver_number;
      best.set(n, Math.min(best.get(n) ?? Infinity, lap.time));
      const sorted = [...best.values()].sort((a, b) => a - b);
      if (sorted.length >= places) points.push({ t: lap.t, time: sorted[places - 1] });
    }
    if (points.length) points.push({ t: span.end, time: points.at(-1)!.time });
    cutoffs.push({ part: span.number, places, points });
  });
  return { parts: spans, laps, cutoffs };
}

export interface TeammateBattle {
  team: string;
  ahead: Driver;
  behind: Driver;
  /** Seconds, in the last part both set a time in. */
  gap: number | null;
  part: number | null;
}

/** Each team's pair, ahead-first, with the gap from the last part they both ran in. */
export function teammateBattles(parts: QualifyingPart[]): TeammateBattle[] {
  const order = qualifyingOrder(parts);
  const rank = new Map(order.map((d, i) => [d.driver_number, i]));
  const teams = new Map<string, Driver[]>();
  for (const d of order) teams.set(d.team_name, [...(teams.get(d.team_name) ?? []), d]);

  return [...teams]
    .filter(([, pair]) => pair.length === 2)
    .map(([team, [ahead, behind]]) => {
      const shared = parts.findLast((p) => {
        const times = [ahead, behind].map((d) => p.rows.find((r) => r.driver.driver_number === d.driver_number)?.best);
        return times.every((t) => t != null);
      });
      const best = (d: Driver) => shared?.rows.find((r) => r.driver.driver_number === d.driver_number)?.best ?? null;
      const [a, b] = [best(ahead), best(behind)];
      return { team, ahead, behind, gap: a != null && b != null ? b - a : null, part: shared?.number ?? null };
    })
    .sort((x, y) => rank.get(x.ahead.driver_number)! - rank.get(y.ahead.driver_number)!);
}

// --- practice analysis ----------------------------------------------------

export interface TeamSectors {
  team: string;
  drivers: Driver[];
  /** Each sector's best across the team's valid laps. */
  sectors: ({ driver: Driver; time: number } | null)[];
  /** The best sectors added together. */
  ideal: number | null;
  best: { driver: Driver; time: number } | null;
}

export function teamSectorLeaders(timeline: SessionTimeline, drivers: Driver[]): TeamSectors[] {
  const teams = new Map<string, Driver[]>();
  for (const d of drivers) teams.set(d.team_name, [...(teams.get(d.team_name) ?? []), d]);

  const rows = [...teams].map(([team, members]) => {
    const sectors: TeamSectors["sectors"] = [null, null, null];
    let best: TeamSectors["best"] = null;
    for (const driver of members) {
      for (const lap of timedLaps(timeline, driver.driver_number)) {
        if (!best || lap.duration! < best.time) best = { driver, time: lap.duration! };
        lap.sectors.forEach((time, i) => {
          if (time != null && (!sectors[i] || time < sectors[i]!.time)) sectors[i] = { driver, time };
        });
      }
    }
    const ideal = sectors.every((s) => s != null) ? sectors.reduce((a, s) => a + s!.time, 0) : null;
    return { team, drivers: members, sectors, ideal, best };
  });
  return rows.sort((a, b) => (a.ideal ?? Infinity) - (b.ideal ?? Infinity));
}
