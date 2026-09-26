import { lastIndexAtOrBefore, telemetryBuffer } from "@/lib/telemetry/buffer";
import { formatGap, formatLapTime, parseDate } from "@/lib/telemetry/format";
import { Driver, LapRow, PositionRow, RaceControlRow, StintRow } from "@/lib/telemetry/types";

export interface TimedLap {
  lap: number;
  start: number;
  end: number | null;
  duration: number | null;
  sectors: [number | null, number | null, number | null];
  isPitOut: boolean;
  speedTrap: number | null;
}

/** A timed segment of a session: Q1/Q2/Q3 in qualifying, one segment otherwise. */
export interface SessionPhase {
  number: number | null;
  start: number;
}

/** Low-frequency session data indexed per driver for fast lookups at any time. */
export interface SessionTimeline {
  positions: Map<number, { t: number[]; position: number[] }>;
  laps: Map<number, TimedLap[]>;
  stints: Map<number, StintRow[]>;
  phases: SessionPhase[];
}

export function buildTimeline(
  positions: PositionRow[],
  laps: LapRow[],
  stints: StintRow[],
  raceControl: RaceControlRow[]
): SessionTimeline {
  const timeline: SessionTimeline = {
    positions: new Map(),
    laps: new Map(),
    stints: new Map(),
    phases: raceControl
      .filter((r) => r.category === "SessionStatus" && r.message === "SESSION STARTED")
      .map((r) => ({ number: r.qualifying_phase, start: parseDate(r.date) }))
      .sort((a, b) => a.start - b.start),
  };

  for (const row of [...positions].sort((a, b) => parseDate(a.date) - parseDate(b.date))) {
    let series = timeline.positions.get(row.driver_number);
    if (!series) timeline.positions.set(row.driver_number, (series = { t: [], position: [] }));
    series.t.push(parseDate(row.date));
    series.position.push(row.position);
  }

  for (const row of laps) {
    if (row.date_start == null) continue;
    const start = parseDate(row.date_start);
    const list = timeline.laps.get(row.driver_number) ?? [];
    list.push({
      lap: row.lap_number,
      start,
      end: row.lap_duration != null ? start + row.lap_duration * 1000 : null,
      duration: row.lap_duration,
      sectors: [row.duration_sector_1, row.duration_sector_2, row.duration_sector_3],
      isPitOut: row.is_pit_out_lap,
      speedTrap: row.st_speed,
    });
    timeline.laps.set(row.driver_number, list);
  }
  for (const list of timeline.laps.values()) list.sort((a, b) => a.lap - b.lap);

  for (const row of stints) {
    const list = timeline.stints.get(row.driver_number) ?? [];
    list.push(row);
    timeline.stints.set(row.driver_number, list);
  }
  for (const list of timeline.stints.values()) list.sort((a, b) => a.stint_number - b.stint_number);

  return timeline;
}

export function positionAt(timeline: SessionTimeline, driver: number, time: number): number | null {
  const series = timeline.positions.get(driver);
  if (!series) return null;
  const i = lastIndexAtOrBefore(series.t, time);
  return i < 0 ? null : series.position[i];
}

export function currentLap(timeline: SessionTimeline, driver: number, time: number): number | null {
  const laps = timeline.laps.get(driver);
  if (!laps) return null;
  let lap: number | null = null;
  for (const l of laps) {
    if (l.start > time) break;
    lap = l.lap;
  }
  return lap;
}

export function completedLaps(timeline: SessionTimeline, driver: number, time: number): TimedLap[] {
  return (timeline.laps.get(driver) ?? []).filter((l) => l.end != null && l.end <= time);
}

export function bestLap(timeline: SessionTimeline, driver: number, time: number): TimedLap | null {
  let best: TimedLap | null = null;
  for (const lap of completedLaps(timeline, driver, time)) {
    if (best == null || lap.duration! < best.duration!) best = lap;
  }
  return best;
}

export interface TyreState {
  compound: string | null;
  age: number | null;
  stint: number;
}

export function tyreAt(timeline: SessionTimeline, driver: number, lap: number | null): TyreState | null {
  const stints = timeline.stints.get(driver);
  if (!stints?.length) return null;
  const stint =
    lap == null
      ? stints[0]
      : stints.find((s) => s.lap_start <= lap && lap <= (s.lap_end ?? Infinity)) ?? stints[stints.length - 1];
  const age =
    stint.tyre_age_at_start == null || lap == null
      ? stint.tyre_age_at_start
      : stint.tyre_age_at_start + Math.max(0, lap - stint.lap_start);
  return { compound: stint.compound, age, stint: stint.stint_number };
}

export function phaseIndexAt(timeline: SessionTimeline, time: number): number {
  let index = -1;
  for (let i = 0; i < timeline.phases.length && timeline.phases[i].start <= time; i++) index = i;
  return index;
}

/** "Q2" during qualifying, null for sessions without numbered phases. */
export function phaseLabelAt(timeline: SessionTimeline, time: number): string | null {
  const phase = timeline.phases[phaseIndexAt(timeline, time)];
  return phase?.number != null ? `Q${phase.number}` : null;
}

function bestLapBetween(laps: TimedLap[], from: number, until: number, time: number): number | null {
  let best: number | null = null;
  for (const lap of laps) {
    if (lap.start < from || lap.start >= until || lap.end == null || lap.end > time) continue;
    if (best == null || lap.duration! < best) best = lap.duration!;
  }
  return best;
}

/**
 * Timing in practice/qualifying ranks laps within the current phase only (Q2
 * ignores Q1 times). Drivers without a time this phase — eliminated, or not yet
 * out — fall back to their best from the latest earlier phase they ran in.
 */
function phaseBest(timeline: SessionTimeline, driver: number, time: number) {
  const laps = timeline.laps.get(driver) ?? [];
  const { phases } = timeline;
  const current = phaseIndexAt(timeline, time);
  if (current < 0) return { duration: bestLapBetween(laps, -Infinity, Infinity, time), fromPhase: null };

  for (let i = current; i >= 0; i--) {
    const until = i + 1 < phases.length ? phases[i + 1].start : Infinity;
    const duration = bestLapBetween(laps, phases[i].start, until, time);
    if (duration != null) return { duration, fromPhase: i === current ? null : phases[i].number };
  }
  return { duration: null, fromPhase: null };
}

export interface LeaderboardRow {
  driverNumber: number;
  driver: Driver;
  position: number | null;
  gapLabel: string;
  /** Time carried over from an earlier qualifying phase; shown de-emphasised. */
  isCarriedOver: boolean;
  isLeader: boolean;
  lap: number | null;
  tyre: TyreState | null;
}

export function buildLeaderboard(
  timeline: SessionTimeline,
  drivers: Driver[],
  isRace: boolean,
  time: number
): LeaderboardRow[] {
  const rows = drivers.map((driver) => {
    const n = driver.driver_number;
    const lap = currentLap(timeline, n, time);
    return {
      driverNumber: n,
      driver,
      position: positionAt(timeline, n, time),
      lap,
      tyre: tyreAt(timeline, n, lap),
      best: isRace ? null : phaseBest(timeline, n, time),
    };
  });

  rows.sort((a, b) => (a.position ?? 99) - (b.position ?? 99) || a.driverNumber - b.driverNumber);

  const fastest = rows.reduce<number | null>((min, r) => {
    const d = r.best && r.best.fromPhase == null ? r.best.duration : null;
    return d != null && (min == null || d < min) ? d : min;
  }, null);

  return rows.map(({ best, ...row }, index) => {
    const isLeader = index === 0 && row.position != null;
    let gapLabel: string;
    let isCarriedOver = false;

    if (isRace) {
      const sample = telemetryBuffer.sampleInterval(row.driverNumber, time);
      gapLabel = isLeader ? "LEADER" : formatGap(sample?.gap ?? null);
    } else if (best?.duration == null) {
      gapLabel = "NO TIME";
    } else if (best.fromPhase != null) {
      gapLabel = `Q${best.fromPhase} ${formatLapTime(best.duration)}`;
      isCarriedOver = true;
    } else if (best.duration === fastest) {
      gapLabel = formatLapTime(best.duration);
    } else {
      gapLabel = `+${(best.duration - (fastest ?? best.duration)).toFixed(3)}`;
    }

    return { ...row, isLeader, gapLabel, isCarriedOver };
  });
}

export interface SessionStats {
  fastestLap: { driver: number; duration: number } | null;
  topSpeed: { driver: number; speed: number } | null;
}

export function sessionStats(timeline: SessionTimeline, time: number): SessionStats {
  let fastestLap: SessionStats["fastestLap"] = null;
  let topSpeed: SessionStats["topSpeed"] = null;
  for (const [driver, laps] of timeline.laps) {
    for (const lap of laps) {
      if (lap.end == null || lap.end > time) continue;
      if (lap.duration != null && (fastestLap == null || lap.duration < fastestLap.duration)) {
        fastestLap = { driver, duration: lap.duration };
      }
      if (lap.speedTrap != null && (topSpeed == null || lap.speedTrap > topSpeed.speed)) {
        topSpeed = { driver, speed: lap.speedTrap };
      }
    }
  }
  return { fastestLap, topSpeed };
}
