import { parseDate } from "@/lib/telemetry/format";
import {
  CarDataRow,
  CircuitLayout,
  Driver,
  IntervalRow,
  LapRow,
  LocationRow,
  PositionRow,
  RaceControlRow,
  ReplayWindow,
  Session,
  StintRow,
} from "@/lib/telemetry/types";

// Mock implementation of the telemetry data layer. Every function mirrors a
// real OpenF1 / MultiViewer request (noted above each one); fixtures under
// public/mock/telemetry are captured real responses. Wiring live data means
// replacing these bodies with fetch() calls — callers don't change.

const MOCK_BASE = "/mock/telemetry";
const cache = new Map<string, Promise<unknown>>();

function loadJson<T>(path: string): Promise<T | null> {
  if (!cache.has(path)) {
    cache.set(
      path,
      fetch(`${MOCK_BASE}/${path}`).then((res) => (res.ok ? res.json() : null))
    );
  }
  return cache.get(path) as Promise<T | null>;
}

async function loadRows<T>(path: string): Promise<T[]> {
  return (await loadJson<T[]>(path)) ?? [];
}

function between<T extends { date: string }>(rows: T[], from: number, to: number): T[] {
  return rows.filter((row) => {
    const t = parseDate(row.date);
    return t >= from && t < to;
  });
}

/** Real: OpenF1 coverage starts at 2023. Mock: only the current season is captured. */
export function getAvailableYears(): number[] {
  return [new Date().getFullYear()];
}

/** Real: GET /sessions?year={year} */
export async function getSessions(year: number): Promise<Session[]> {
  const sessions = await loadRows<Session>(`sessions-${year}.json`);
  const now = Date.now();
  return sessions
    .filter((s) => !s.is_cancelled && parseDate(s.date_start) <= now)
    .sort((a, b) => parseDate(a.date_start) - parseDate(b.date_start));
}

/**
 * Real: the session's own date_start/date_end. Mock: only the captured window,
 * and null when no telemetry was captured for the session.
 */
export async function getReplayWindow(session: Session): Promise<ReplayWindow | null> {
  const meta = await loadJson<{ window: { start: string; end: string } }>(
    `${session.session_key}/meta.json`
  );
  if (!meta) return null;
  return { start: parseDate(meta.window.start), end: parseDate(meta.window.end) };
}

/** Real: GET /drivers?session_key={key} */
export function getDrivers(sessionKey: number): Promise<Driver[]> {
  return loadRows<Driver>(`${sessionKey}/drivers.json`);
}

/** Real: GET /position?session_key={key}&date<{to} */
export async function getPositions(sessionKey: number, to: number): Promise<PositionRow[]> {
  return between(await loadRows<PositionRow>(`${sessionKey}/position.json`), 0, to);
}

/** Real: GET /stints?session_key={key} */
export function getStints(sessionKey: number): Promise<StintRow[]> {
  return loadRows<StintRow>(`${sessionKey}/stints.json`);
}

/** Real: GET /laps?session_key={key}&date_start<{to} */
export async function getLaps(sessionKey: number, to: number): Promise<LapRow[]> {
  const laps = await loadRows<LapRow>(`${sessionKey}/laps.json`);
  return laps.filter((lap) => lap.date_start != null && parseDate(lap.date_start) < to);
}

/** Real: GET /race_control?session_key={key}&date<{to} */
export async function getRaceControl(sessionKey: number, to: number): Promise<RaceControlRow[]> {
  return between(await loadRows<RaceControlRow>(`${sessionKey}/race_control.json`), 0, to);
}

/** Real: GET /intervals?session_key={key}&date>{from}&date<{to} (races only) */
export async function getIntervals(sessionKey: number, from: number, to: number): Promise<IntervalRow[]> {
  return between(await loadRows<IntervalRow>(`${sessionKey}/intervals.json`), from, to);
}

/** Real: GET /location?session_key={key}&date>{from}&date<{to} (all cars in one request) */
export async function getLocations(sessionKey: number, from: number, to: number): Promise<LocationRow[]> {
  return between(await loadRows<LocationRow>(`${sessionKey}/location.json`), from, to);
}

/** Real: GET /car_data?session_key={key}&date>{from}&date<{to} (all cars in one request) */
export async function getCarData(sessionKey: number, from: number, to: number): Promise<CarDataRow[]> {
  return between(await loadRows<CarDataRow>(`${sessionKey}/car_data.json`), from, to);
}

/** Real: GET api.multiviewer.app/api/v1/circuits/{circuitKey}/{year} — 404s for brand-new circuits. */
export function getCircuitLayout(circuitKey: number, year: number): Promise<CircuitLayout | null> {
  return loadJson<CircuitLayout>(`circuits/${circuitKey}-${year}.json`);
}
