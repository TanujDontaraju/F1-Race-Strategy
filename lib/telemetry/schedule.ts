import { parseDate } from "@/lib/telemetry/format";
import { CircuitLayout, Session } from "@/lib/telemetry/types";

// The season calendar, from Jolpica (the free successor to the Ergast API). F1's own
// archive only lists a weekend once it has started, so it can't say what's next.
const SCHEDULE = "https://api.jolpi.ca/ergast/f1";
// Open-source circuit outlines (MIT), for weekends MultiViewer and F1 have no data for yet.
const OUTLINES = "https://raw.githubusercontent.com/bacinger/f1-circuits/master";
const TIMEOUT_MS = 2500;
// Race weeks start on Monday in US Eastern time, where most races land on Sunday.
const RACE_WEEK_ZONE = "America/New_York";
// Outlines are matched to the calendar by circuit coordinates.
const MAX_MATCH_KM = 10;

export interface WeekendSession {
  /** F1's session names ("Practice 1", "Qualifying", …), so the usual short labels apply. */
  name: string;
  start: number;
}

export interface RaceWeek {
  season: number;
  /** "Bahrain Grand Prix". */
  name: string;
  /** The circuit's short place name, e.g. "Sepang". */
  place: string;
  /** Monday 00:00 US Eastern of the race week. */
  weekStart: number;
  raceStart: number;
  sessions: WeekendSession[];
  /** The outline for weekends with no data yet; null if none could be found. */
  layout: CircuitLayout | null;
}

interface JolpicaSlot {
  date: string;
  time?: string;
}

interface JolpicaRace extends JolpicaSlot {
  season: string;
  raceName: string;
  Circuit: { circuitName: string; Location: { lat: string; long: string; locality: string } };
  FirstPractice?: JolpicaSlot;
  SecondPractice?: JolpicaSlot;
  ThirdPractice?: JolpicaSlot;
  SprintQualifying?: JolpicaSlot;
  SprintShootout?: JolpicaSlot;
  Sprint?: JolpicaSlot;
  Qualifying?: JolpicaSlot;
}

const SLOTS: [keyof JolpicaRace, string][] = [
  ["FirstPractice", "Practice 1"],
  ["SecondPractice", "Practice 2"],
  ["ThirdPractice", "Practice 3"],
  ["SprintQualifying", "Sprint Qualifying"],
  ["SprintShootout", "Sprint Shootout"],
  ["Sprint", "Sprint"],
  ["Qualifying", "Qualifying"],
];

interface OutlineLocation {
  id: string;
  location: string;
  lat: number;
  lon: number;
}

// In development, `?now=2026-09-28T09:00-04:00` sets the clock, to check how any week looks.
const clockOffset = (() => {
  if (process.env.NODE_ENV === "production" || typeof window === "undefined") return 0;
  const fake = Date.parse(new URLSearchParams(window.location.search).get("now") ?? "");
  return Number.isNaN(fake) ? 0 : fake - Date.now();
})();

export const currentTime = () => Date.now() + clockOffset;

async function fetchJson<T>(url: string): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const slotTime = (slot: JolpicaSlot) => Date.parse(`${slot.date}T${slot.time ?? "00:00:00Z"}`);

/** How far a zone's wall clock is ahead of UTC at an instant. */
function zoneOffset(at: number): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: RACE_WEEK_ZONE,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    })
      .formatToParts(at)
      .map((p) => [p.type, Number(p.value)])
  );
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - at;
}

/** Monday 00:00 US Eastern of the week the race falls in. */
function raceWeekStart(raceStart: number): number {
  const wall = new Date(raceStart + zoneOffset(raceStart));
  const daysSinceMonday = (wall.getUTCDay() + 6) % 7;
  const monday = Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate() - daysSinceMonday);
  return monday - zoneOffset(monday - zoneOffset(monday));
}

/** Null when the calendar can't be reached. */
async function seasonRaces(season: number): Promise<JolpicaRace[] | null> {
  const data = await fetchJson<{ MRData: { RaceTable: { Races: JolpicaRace[] } } }>(
    `${SCHEDULE}/${season}/races/?limit=100`
  );
  return data?.MRData.RaceTable.Races ?? null;
}

const km = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) =>
  Math.hypot(a.lat - b.lat, (a.lon - b.lon) * Math.cos((a.lat * Math.PI) / 180)) * 111;

/** GeoJSON longitude/latitude to flat metres with y pointing north, like the rest of the app's outlines. */
function toLayout(coordinates: [number, number][]): CircuitLayout {
  const lat0 = coordinates.reduce((sum, [, lat]) => sum + lat, 0) / coordinates.length;
  const lon0 = coordinates.reduce((sum, [lon]) => sum + lon, 0) / coordinates.length;
  const metresPerLon = 111_320 * Math.cos((lat0 * Math.PI) / 180);
  // The outline is a closed loop; drop the repeated last point.
  const points = coordinates.slice(0, -1);
  return {
    x: points.map(([lon]) => (lon - lon0) * metresPerLon),
    y: points.map(([, lat]) => (lat - lat0) * 110_540),
    rotation: 0,
    corners: [],
  };
}

async function outlineNear(lat: number, lon: number): Promise<{ place: string; layout: CircuitLayout } | null> {
  const locations = await fetchJson<OutlineLocation[]>(`${OUTLINES}/f1-locations.json`);
  const nearest = locations
    ?.map((l) => ({ ...l, distance: km(l, { lat, lon }) }))
    .sort((a, b) => a.distance - b.distance)[0];
  if (!nearest || nearest.distance > MAX_MATCH_KM) return null;

  type Geometry = { type: string; coordinates: [number, number][] | [number, number][][] };
  const geo = await fetchJson<{ features: { geometry: Geometry }[] }>(`${OUTLINES}/circuits/${nearest.id}.geojson`);
  const geometry = geo?.features[0]?.geometry;
  if (!geometry) return null;
  const line = (geometry.type === "MultiLineString" ? geometry.coordinates[0] : geometry.coordinates) as [number, number][];
  return line.length > 10 ? { place: nearest.location, layout: toLayout(line) } : null;
}

async function toRaceWeek(race: JolpicaRace): Promise<RaceWeek> {
  const raceStart = slotTime(race);
  const sessions = SLOTS.flatMap(([key, name]) => {
    const slot = race[key] as JolpicaSlot | undefined;
    return slot ? [{ name, start: slotTime(slot) }] : [];
  });
  sessions.push({ name: "Race", start: raceStart });
  sessions.sort((a, b) => a.start - b.start);

  const { lat, long, locality } = race.Circuit.Location;
  const outline = await outlineNear(Number(lat), Number(long));
  return {
    season: Number(race.season),
    name: race.raceName.replace(/(Grand Prix).*$/, "$1"),
    place: outline?.place ?? locality,
    weekStart: raceWeekStart(raceStart),
    raceStart,
    sessions,
    layout: outline?.layout ?? null,
  };
}

/**
 * The Grand Prix whose race week it is: the latest race whose week (from Monday,
 * US Eastern) has begun. Weeks without a race keep the last one. Null if the
 * calendar can't be reached.
 */
async function findRaceWeek(): Promise<RaceWeek | null> {
  const now = currentTime();
  const season = new Date(now + zoneOffset(now)).getUTCFullYear();
  for (const year of [season, season - 1]) {
    const races = await seasonRaces(year);
    if (!races) return null;
    const started = races.filter((race) => raceWeekStart(slotTime(race)) <= now);
    if (started.length > 0) return toRaceWeek(started[started.length - 1]);
  }
  return null;
}

let raceWeekRequest: Promise<RaceWeek | null> | null = null;

/** Fetched once per page load; navigating between pages reuses it. */
export function getRaceWeek(): Promise<RaceWeek | null> {
  raceWeekRequest ??= findRaceWeek();
  return raceWeekRequest;
}

/** "Oct 2 – 4" in the viewer's own time zone and locale. */
export function formatWeekendDates(week: RaceWeek): string {
  const first = week.sessions[0]?.start ?? week.raceStart;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).formatRange(first, week.raceStart);
}

/** The archive's sessions that belong to the race week, oldest first. */
export function raceWeekSessions(sessions: Session[], week: RaceWeek): Session[] {
  const end = week.raceStart + 12 * 60 * 60 * 1000;
  return sessions.filter((s) => {
    const start = parseDate(s.date_start);
    return start >= week.weekStart && start <= end;
  });
}
