import { getCarData, getLocations } from "@/lib/telemetry/api";
import { parseDate } from "@/lib/telemetry/format";

// High-frequency telemetry (location/car_data ~3.7 Hz per car) lives outside
// React state: the track map samples it every animation frame, and a full
// session is far too large to hold at once, so it's loaded in chunks ahead of
// the playback cursor and trimmed behind it.

const CHUNK_MS = 30_000;
const LOOKAHEAD_MS = 30_000;
const RETAIN_MS = 60_000;
// Loading starts a little behind the cursor so there's a sample to show straight away,
// including right at the end of a session.
const LOOKBEHIND_MS = 5_000;
const MAX_INTERPOLATION_GAP_MS = 2_000;
const STALE_MS = 5_000;
const RETRY_MS = 2_000;

interface Series {
  t: number[];
}
interface LocationSeries extends Series {
  x: number[];
  y: number[];
}
interface CarSeries extends Series {
  speed: number[];
  gear: number[];
  throttle: number[];
  brake: number[];
  rpm: number[];
}

export interface CarSample {
  speed: number;
  gear: number;
  throttle: number;
  brake: number;
  rpm: number;
}

export function lastIndexAtOrBefore(times: number[], time: number): number {
  let lo = 0;
  let hi = times.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= time) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

function seriesFor<S extends Series>(map: Map<number, S>, driver: number, create: () => S): S {
  let series = map.get(driver);
  if (!series) {
    series = create();
    map.set(driver, series);
  }
  return series;
}

function trim(series: Series, cutoff: number) {
  // Keep the sample at/before the cutoff so sampling right at the cutoff still works.
  const index = lastIndexAtOrBefore(series.t, cutoff);
  if (index <= 0) return;
  for (const column of Object.values(series) as unknown[][]) column.splice(0, index);
}

class TelemetryBuffer {
  private locations = new Map<number, LocationSeries>();
  private carData = new Map<number, CarSeries>();
  private sessionKey: number | null = null;
  private windowEnd = 0;
  private from = 0;
  private until = 0;
  private inflight: Promise<void> | null = null;
  private generation = 0;
  private retryAt = 0;
  /** Called when a chunk lands, so views sampling the buffer at render time can refresh while paused. */
  onChunk: (() => void) | null = null;

  reset(sessionKey: number | null, start = 0, windowEnd = 0) {
    this.generation++;
    this.sessionKey = sessionKey;
    this.windowEnd = windowEnd;
    this.from = start - LOOKBEHIND_MS;
    this.until = start - LOOKBEHIND_MS;
    this.inflight = null;
    this.retryAt = 0;
    this.locations.clear();
    this.carData.clear();
  }

  covers(time: number): boolean {
    return time >= this.from && time <= this.until;
  }

  /** True when playback can advance to `time` without outrunning loaded data. */
  isBuffered(time: number): boolean {
    return time <= this.until || this.until >= this.windowEnd;
  }

  ensure(cursor: number): Promise<void> {
    if (this.sessionKey == null) return Promise.resolve();
    if (this.inflight) return this.inflight;
    if (this.until >= this.windowEnd || this.until - cursor > LOOKAHEAD_MS) return Promise.resolve();
    if (Date.now() < this.retryAt) return Promise.resolve();

    const generation = this.generation;
    const sessionKey = this.sessionKey;
    const from = this.until;
    const to = Math.min(from + CHUNK_MS, this.windowEnd);

    this.inflight = Promise.all([getLocations(sessionKey, from, to), getCarData(sessionKey, from, to)])
      .then(([locations, carData]) => {
        if (generation !== this.generation) return;

        const byDate = <T extends { date: string }>(rows: T[]) =>
          rows.map((row) => ({ row, t: parseDate(row.date) })).sort((a, b) => a.t - b.t);

        for (const { row, t } of byDate(locations)) {
          const s = seriesFor(this.locations, row.driver_number, () => ({ t: [], x: [], y: [] }));
          s.t.push(t);
          s.x.push(row.x);
          s.y.push(row.y);
        }
        for (const { row, t } of byDate(carData)) {
          const s = seriesFor(this.carData, row.driver_number, () => ({
            t: [], speed: [], gear: [], throttle: [], brake: [], rpm: [],
          }));
          s.t.push(t);
          s.speed.push(row.speed);
          s.gear.push(row.n_gear);
          s.throttle.push(row.throttle);
          s.brake.push(row.brake);
          s.rpm.push(row.rpm);
        }

        this.until = to;
        this.evict(cursor);
        this.onChunk?.();
      })
      .catch(() => {
        // Playback holds in a buffering state until a retry succeeds.
        if (generation === this.generation) this.retryAt = Date.now() + RETRY_MS;
      })
      .finally(() => {
        if (generation === this.generation) this.inflight = null;
      });

    return this.inflight;
  }

  private evict(cursor: number) {
    const cutoff = cursor - RETAIN_MS;
    if (cutoff <= this.from) return;
    const maps: Map<number, Series>[] = [this.locations, this.carData];
    for (const map of maps) {
      for (const series of map.values()) trim(series, cutoff);
    }
    this.from = cutoff;
  }

  /** Position at `time`, linearly interpolated between samples for smooth motion. */
  samplePosition(driver: number, time: number): { x: number; y: number } | null {
    const s = this.locations.get(driver);
    if (!s) return null;
    const i = lastIndexAtOrBefore(s.t, time);
    if (i < 0) return null;
    const t0 = s.t[i];
    const hasNext = i + 1 < s.t.length;
    if (hasNext && s.t[i + 1] - t0 <= MAX_INTERPOLATION_GAP_MS) {
      const f = (time - t0) / (s.t[i + 1] - t0);
      return { x: s.x[i] + (s.x[i + 1] - s.x[i]) * f, y: s.y[i] + (s.y[i + 1] - s.y[i]) * f };
    }
    if (!hasNext && time - t0 > STALE_MS) return null;
    return { x: s.x[i], y: s.y[i] };
  }

  /** One car's buffered samples in [from, to], for short history charts. */
  carHistory(driver: number, from: number, to: number): { t: number[]; speed: number[]; throttle: number[]; brake: number[] } {
    const s = this.carData.get(driver);
    if (!s) return { t: [], speed: [], throttle: [], brake: [] };
    const lo = lastIndexAtOrBefore(s.t, from) + 1;
    const hi = lastIndexAtOrBefore(s.t, to) + 1;
    return {
      t: s.t.slice(lo, hi),
      speed: s.speed.slice(lo, hi),
      throttle: s.throttle.slice(lo, hi),
      brake: s.brake.slice(lo, hi),
    };
  }

  sampleCar(driver: number, time: number): CarSample | null {
    const s = this.carData.get(driver);
    if (!s) return null;
    const i = lastIndexAtOrBefore(s.t, time);
    if (i < 0 || time - s.t[i] > STALE_MS) return null;
    return { speed: s.speed[i], gear: s.gear[i], throttle: s.throttle[i], brake: s.brake[i], rpm: s.rpm[i] };
  }
}

export const telemetryBuffer = new TelemetryBuffer();
