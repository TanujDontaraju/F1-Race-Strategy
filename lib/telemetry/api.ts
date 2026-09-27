import { parseDate } from "@/lib/telemetry/format";
import {
  CarDataRow,
  CircuitLayout,
  Driver,
  GridRow,
  KnockoutRow,
  IntervalRow,
  LapRow,
  LapTelemetry,
  LocationRow,
  PitRow,
  PositionRow,
  RaceControlRow,
  ReplayWindow,
  RetirementRow,
  Session,
  SessionStatusRow,
  StintRow,
  TrackStatusRow,
  WeatherRow,
} from "@/lib/telemetry/types";

// The telemetry data layer. By default it reads the Python server in server/,
// which rebuilds every session of the season from F1's live-timing archive.
// NEXT_PUBLIC_TELEMETRY_SOURCE=mock switches to the small captured fixtures in
// public/mock/telemetry, for frontend work without the server running.
// Both return rows shaped like types.ts, so callers don't know which is in use.

interface TelemetrySource {
  getSessions(year: number): Promise<Session[]>;
  getReplayWindow(session: Session): Promise<ReplayWindow | null>;
  getDrivers(sessionKey: number): Promise<Driver[]>;
  getPositions(sessionKey: number, to: number): Promise<PositionRow[]>;
  getStints(sessionKey: number): Promise<StintRow[]>;
  getLaps(sessionKey: number, to: number): Promise<LapRow[]>;
  getRaceControl(sessionKey: number, to: number): Promise<RaceControlRow[]>;
  getIntervals(sessionKey: number, from: number, to: number): Promise<IntervalRow[]>;
  getLocations(sessionKey: number, from: number, to: number): Promise<LocationRow[]>;
  getCarData(sessionKey: number, from: number, to: number): Promise<CarDataRow[]>;
  getCircuitLayout(circuitKey: number, year: number): Promise<CircuitLayout | null>;
  getWeather(sessionKey: number): Promise<WeatherRow[]>;
  getTrackStatus(sessionKey: number): Promise<TrackStatusRow[]>;
  getSessionStatus(sessionKey: number): Promise<SessionStatusRow[]>;
  getPitStops(sessionKey: number): Promise<PitRow[]>;
  getGrid(sessionKey: number): Promise<GridRow[]>;
  getRetirements(sessionKey: number): Promise<RetirementRow[]>;
  getKnockouts(sessionKey: number): Promise<KnockoutRow[]>;
  getLapTelemetry(sessionKey: number, driver: number, lap: number): Promise<LapTelemetry | null>;
}

// --- server ---------------------------------------------------------------

const SERVER = (process.env.NEXT_PUBLIC_TELEMETRY_API ?? "http://localhost:8000").replace(/\/+$/, "");
/** True in development, where you start the server yourself; false once pointed at a deployed one. */
export const LOCAL_SERVER = !process.env.NEXT_PUBLIC_TELEMETRY_API;

/** The telemetry server isn't running (or isn't reachable), as opposed to a request failing. */
export class ServerUnreachableError extends Error {
  constructor() {
    super(`Can't reach the telemetry server at ${SERVER}`);
  }
}

async function request<T>(path: string): Promise<T | null> {
  let res: Response;
  try {
    res = await fetch(`${SERVER}${path}`);
  } catch {
    throw new ServerUnreachableError();
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Telemetry server returned ${res.status} for ${path}`);
  return res.json();
}

async function requestRows<T>(path: string): Promise<T[]> {
  return (await request<T[]>(path)) ?? [];
}

const serverSource: TelemetrySource = {
  getSessions: (year) => requestRows(`/sessions?year=${year}`),
  getReplayWindow: (session) => request(`/sessions/${session.session_key}/window`),
  getDrivers: (key) => requestRows(`/sessions/${key}/drivers`),
  getPositions: (key, to) => requestRows(`/sessions/${key}/position?to=${to}`),
  getStints: (key) => requestRows(`/sessions/${key}/stints`),
  getLaps: (key, to) => requestRows(`/sessions/${key}/laps?to=${to}`),
  getRaceControl: (key, to) => requestRows(`/sessions/${key}/race_control?to=${to}`),
  getIntervals: (key, from, to) => requestRows(`/sessions/${key}/intervals?from=${from}&to=${to}`),
  getLocations: (key, from, to) => requestRows(`/sessions/${key}/location?from=${from}&to=${to}`),
  getCarData: (key, from, to) => requestRows(`/sessions/${key}/car_data?from=${from}&to=${to}`),
  getCircuitLayout: (circuitKey, year) => request(`/circuits/${circuitKey}/${year}`),
  getWeather: (key) => requestRows(`/sessions/${key}/weather`),
  getTrackStatus: (key) => requestRows(`/sessions/${key}/track_status`),
  getSessionStatus: (key) => requestRows(`/sessions/${key}/session_status`),
  getPitStops: (key) => requestRows(`/sessions/${key}/pit`),
  getGrid: (key) => requestRows(`/sessions/${key}/grid`),
  getRetirements: (key) => requestRows(`/sessions/${key}/retirements`),
  getKnockouts: (key) => requestRows(`/sessions/${key}/knockouts`),
  getLapTelemetry: (key, driver, lap) => request(`/sessions/${key}/lap_telemetry?driver=${driver}&lap=${lap}`),
};

// --- mock fixtures --------------------------------------------------------

const MOCK_BASE = "/mock/telemetry";
const mockCache = new Map<string, Promise<unknown>>();

function loadJson<T>(path: string): Promise<T | null> {
  if (!mockCache.has(path)) {
    mockCache.set(path, fetch(`${MOCK_BASE}/${path}`).then((res) => (res.ok ? res.json() : null)));
  }
  return mockCache.get(path) as Promise<T | null>;
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

const mockSource: TelemetrySource = {
  async getSessions(year) {
    const sessions = await loadRows<Session>(`sessions-${year}.json`);
    const now = Date.now();
    return sessions
      .filter((s) => !s.is_cancelled && parseDate(s.date_start) <= now)
      .sort((a, b) => parseDate(a.date_start) - parseDate(b.date_start));
  },
  async getReplayWindow(session) {
    const meta = await loadJson<{ window: { start: string; end: string } }>(`${session.session_key}/meta.json`);
    return meta ? { start: parseDate(meta.window.start), end: parseDate(meta.window.end) } : null;
  },
  getDrivers: (key) => loadRows(`${key}/drivers.json`),
  getPositions: async (key, to) => between(await loadRows<PositionRow>(`${key}/position.json`), 0, to),
  getStints: (key) => loadRows(`${key}/stints.json`),
  async getLaps(key, to) {
    const laps = await loadRows<LapRow>(`${key}/laps.json`);
    return laps.filter((lap) => lap.date_start != null && parseDate(lap.date_start) < to);
  },
  getRaceControl: async (key, to) => between(await loadRows<RaceControlRow>(`${key}/race_control.json`), 0, to),
  getIntervals: async (key, from, to) => between(await loadRows<IntervalRow>(`${key}/intervals.json`), from, to),
  getLocations: async (key, from, to) => between(await loadRows<LocationRow>(`${key}/location.json`), from, to),
  getCarData: async (key, from, to) => between(await loadRows<CarDataRow>(`${key}/car_data.json`), from, to),
  getCircuitLayout: (circuitKey, year) => loadJson(`circuits/${circuitKey}-${year}.json`),
  // The captured fixtures predate these; the analysis views show empty states in mock mode.
  getWeather: async () => [],
  getTrackStatus: async () => [],
  getSessionStatus: async () => [],
  getPitStops: async () => [],
  getGrid: async () => [],
  getRetirements: async () => [],
  getKnockouts: async () => [],
  getLapTelemetry: async () => null,
};

// --- public API -----------------------------------------------------------

const source = process.env.NEXT_PUBLIC_TELEMETRY_SOURCE === "mock" ? mockSource : serverSource;

/** Whether the telemetry server answers; always true for the bundled fixtures. */
export async function serverReachable(): Promise<boolean> {
  if (source === mockSource) return true;
  try {
    return (await fetch(`${SERVER}/health`)).ok;
  } catch {
    return false;
  }
}

/** The server covers the current season (F1's archive goes back to 2018 if older years are wanted). */
export function getAvailableYears(): number[] {
  return [new Date().getFullYear()];
}

export const getSessions = (year: number) => source.getSessions(year);
/** Lights out (or the first green light) to the last car taking the flag; null when there's no data. */
export const getReplayWindow = (session: Session) => source.getReplayWindow(session);
export const getDrivers = (sessionKey: number) => source.getDrivers(sessionKey);
export const getPositions = (sessionKey: number, to: number) => source.getPositions(sessionKey, to);
export const getStints = (sessionKey: number) => source.getStints(sessionKey);
export const getLaps = (sessionKey: number, to: number) => source.getLaps(sessionKey, to);
export const getRaceControl = (sessionKey: number, to: number) => source.getRaceControl(sessionKey, to);
/** Races only; empty for practice and qualifying. */
export const getIntervals = (sessionKey: number, from: number, to: number) => source.getIntervals(sessionKey, from, to);
/** All cars' positions in [from, to), ~3.7 Hz each. */
export const getLocations = (sessionKey: number, from: number, to: number) => source.getLocations(sessionKey, from, to);
/** All cars' speed/gear/throttle/brake/rpm in [from, to), ~3.7 Hz each. */
export const getCarData = (sessionKey: number, from: number, to: number) => source.getCarData(sessionKey, from, to);
/** MultiViewer's outline; null for circuits it doesn't know yet (the store then traces one from a lap). */
export const getCircuitLayout = (circuitKey: number, year: number) => source.getCircuitLayout(circuitKey, year);
/** Minute-by-minute conditions. */
export const getWeather = (sessionKey: number) => source.getWeather(sessionKey);
/** Changes of track status (safety car, VSC, red flag…). */
export const getTrackStatus = (sessionKey: number) => source.getTrackStatus(sessionKey);
/** Changes of session status; a restart after a red flag is the next "Started". */
export const getSessionStatus = (sessionKey: number) => source.getSessionStatus(sessionKey);
export const getPitStops = (sessionKey: number) => source.getPitStops(sessionKey);
/** Races only. */
export const getGrid = (sessionKey: number) => source.getGrid(sessionKey);
/** Races only: cars that stopped for good before the flag. */
export const getRetirements = (sessionKey: number) => source.getRetirements(sessionKey);
/** Qualifying only. */
export const getKnockouts = (sessionKey: number) => source.getKnockouts(sessionKey);
/** One lap's speed/throttle/brake/gear/rpm against distance; null if there's no such lap. */
export const getLapTelemetry = (sessionKey: number, driver: number, lap: number) =>
  source.getLapTelemetry(sessionKey, driver, lap);
