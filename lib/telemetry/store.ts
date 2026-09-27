import { create } from "zustand";
import {
  getAvailableYears,
  getCircuitLayout,
  getDrivers,
  getGrid,
  getIntervals,
  getKnockouts,
  getLaps,
  getLocations,
  getPitStops,
  getPositions,
  getRaceControl,
  getReplayWindow,
  getRetirements,
  getSessions,
  getSessionStatus,
  getStints,
  getTrackStatus,
  getWeather,
  ServerUnreachableError,
} from "@/lib/telemetry/api";
import { telemetryBuffer } from "@/lib/telemetry/buffer";
import { buildTimeline, positionAt, SessionTimeline } from "@/lib/telemetry/derive";
import { parseDate } from "@/lib/telemetry/format";
import { buildTrackGeometry, TrackGeometry } from "@/lib/telemetry/geometry";
import {
  CircuitLayout,
  Driver,
  GridRow,
  KnockoutRow,
  PitRow,
  RaceControlRow,
  ReplayWindow,
  RetirementRow,
  Session,
  SessionStatusRow,
  TrackStatusRow,
  WeatherRow,
} from "@/lib/telemetry/types";
import { sessionKind, ViewId, viewsFor } from "@/lib/telemetry/views";

export type PlaybackSpeed = 1 | 5 | 10;
export const PLAYBACK_SPEEDS: PlaybackSpeed[] = [1, 5, 10];

/** "offline": the telemetry server isn't running; the dashboard reconnects once it is. */
export type LoadStatus = "loading" | "ready" | "unavailable" | "error" | "offline";

export const OFFLINE_MESSAGE =
  "Can't reach the telemetry server on localhost:8000. Start it and this reconnects by itself.";

const failed = (error: unknown): LoadStatus => (error instanceof ServerUnreachableError ? "offline" : "error");

// React panels re-render off `displayCursor`, refreshed at this interval; the
// track map reads `cursor` directly every animation frame instead.
const DISPLAY_INTERVAL_MS = 200;
// Caps the catch-up jump when the tab regains focus after requestAnimationFrame paused.
const MAX_FRAME_MS = 100;
/** Drivers the analysis views compare at once: each line gets a direct label, which stays legible up to four. */
export const MAX_COMPARE = 4;
const DEFAULT_COMPARE = 3;

interface TelemetryState {
  years: number[];
  year: number;
  sessions: Session[];
  session: Session | null;
  status: LoadStatus;
  drivers: Driver[];
  timeline: SessionTimeline | null;
  track: TrackGeometry | null;
  pitLoss: CircuitLayout["pitLoss"] | null;
  replay: ReplayWindow | null;
  cursor: number;
  displayCursor: number;
  isPlaying: boolean;
  isBuffering: boolean;
  speed: PlaybackSpeed;
  selectedDriver: number | null;
  /** Bumped whenever buffered telemetry arrives; panels that sample the buffer re-render on it. */
  bufferRevision: number;
  raceControl: RaceControlRow[];
  weather: WeatherRow[];
  trackStatus: TrackStatusRow[];
  sessionStatus: SessionStatusRow[];
  pits: PitRow[];
  grid: GridRow[];
  retirements: RetirementRow[];
  knockouts: KnockoutRow[];
  view: ViewId;
  /** Drivers the analysis views compare, in the order they were picked. */
  compare: number[];

  loadYear: (year: number) => Promise<void>;
  selectSession: (sessionKey: number) => Promise<void>;
  /** Loads whatever failed to load last time: the season's sessions, or the chosen session. */
  retry: () => Promise<void>;
  togglePlay: () => void;
  setSpeed: (speed: PlaybackSpeed) => void;
  seek: (time: number) => void;
  selectDriver: (driver: number) => void;
  advance: (frameMs: number, now: number) => void;
  setView: (view: ViewId) => void;
  setCompare: (drivers: number[]) => void;
}

let loadToken = 0;
let lastDisplayUpdate = 0;

/** No MultiViewer layout (e.g. a brand-new circuit): trace the fastest clean lap instead. */
async function traceOutline(
  sessionKey: number,
  timeline: SessionTimeline,
  replay: ReplayWindow
): Promise<CircuitLayout | null> {
  let best: { driver: number; start: number; end: number; duration: number } | null = null;
  for (const [driver, laps] of timeline.laps) {
    for (const lap of laps) {
      if (lap.isPitOut || lap.end == null || lap.duration == null) continue;
      if (lap.start < replay.start || lap.end > replay.end) continue;
      if (!best || lap.duration < best.duration) best = { driver, start: lap.start, end: lap.end, duration: lap.duration };
    }
  }
  if (!best) return null;
  const driver = best.driver;
  const rows = (await getLocations(sessionKey, best.start, best.end))
    .filter((row) => row.driver_number === driver)
    .sort((a, b) => parseDate(a.date) - parseDate(b.date));
  if (rows.length < 10) return null;
  return { x: rows.map((r) => r.x), y: rows.map((r) => r.y), rotation: 0, corners: [] };
}

function leaderAt(timeline: SessionTimeline, drivers: Driver[], time: number): number | null {
  const leader = drivers.find((d) => positionAt(timeline, d.driver_number, time) === 1);
  return leader?.driver_number ?? drivers[0]?.driver_number ?? null;
}

/** Keep the comparison across sessions of a weekend; otherwise start with the top three at the end. */
function compareFor(previous: number[], timeline: SessionTimeline, drivers: Driver[], end: number): number[] {
  const present = new Set(drivers.map((d) => d.driver_number));
  if (previous.length > 0 && previous.every((n) => present.has(n))) return previous;
  return drivers
    .map((d) => ({ n: d.driver_number, p: positionAt(timeline, d.driver_number, end) ?? 99 }))
    .sort((a, b) => a.p - b.p)
    .slice(0, DEFAULT_COMPARE)
    .map((d) => d.n);
}

const NO_EXTRAS = {
  raceControl: [],
  weather: [],
  trackStatus: [],
  sessionStatus: [],
  pits: [],
  grid: [],
  retirements: [],
  knockouts: [],
};

export const useTelemetryStore = create<TelemetryState>((set, get) => ({
  years: getAvailableYears(),
  year: getAvailableYears()[0],
  sessions: [],
  session: null,
  status: "loading",
  drivers: [],
  timeline: null,
  track: null,
  pitLoss: null,
  replay: null,
  cursor: 0,
  displayCursor: 0,
  isPlaying: false,
  isBuffering: false,
  speed: 1,
  selectedDriver: null,
  bufferRevision: 0,
  ...NO_EXTRAS,
  view: "pitwall",
  compare: [],

  loadYear: async (year) => {
    set({ year, sessions: [], session: null, status: "loading" });
    let sessions: Session[];
    try {
      sessions = await getSessions(year);
    } catch (error) {
      if (get().year === year) set({ status: failed(error) });
      return;
    }
    if (get().year !== year) return;
    set({ sessions });
    const latest = sessions[sessions.length - 1];
    if (latest) await get().selectSession(latest.session_key);
    else set({ status: "unavailable" });
  },

  selectSession: async (sessionKey) => {
    const token = ++loadToken;
    const session = get().sessions.find((s) => s.session_key === sessionKey) ?? null;
    if (!session) return;

    telemetryBuffer.reset(null);
    // Stay on the current view when the new session has it (a race's Strategy tab doesn't exist in qualifying).
    const view = viewsFor(session).some((v) => v.id === get().view) ? get().view : "pitwall";
    set({
      session,
      status: "loading",
      isPlaying: false,
      isBuffering: false,
      replay: null,
      drivers: [],
      timeline: null,
      track: null,
      pitLoss: null,
      view,
      ...NO_EXTRAS,
    });

    try {
      // The outline is small and independent of the session's data, so publish it
      // as soon as it lands; the intro and track map draw it while the rest loads.
      const layoutRequest = getCircuitLayout(session.circuit_key, session.year)
        .catch(() => null)
        .then((layout) => {
          if (token === loadToken && layout) set({ track: buildTrackGeometry(layout), pitLoss: layout.pitLoss ?? null });
          return layout;
        });

      const replay = await getReplayWindow(session);
      if (token !== loadToken) return;
      if (!replay) {
        await layoutRequest;
        if (token === loadToken) set({ status: "unavailable" });
        return;
      }

      const kind = sessionKind(session);
      const isRace = kind === "race";
      const [drivers, positions, intervals, stints, laps, raceControl, layout, extras] = await Promise.all([
        getDrivers(sessionKey),
        getPositions(sessionKey, replay.end),
        isRace ? getIntervals(sessionKey, 0, replay.end) : [],
        getStints(sessionKey),
        getLaps(sessionKey, replay.end),
        getRaceControl(sessionKey, replay.end),
        layoutRequest,
        Promise.all([
          getWeather(sessionKey),
          getTrackStatus(sessionKey),
          getSessionStatus(sessionKey),
          getPitStops(sessionKey),
          isRace ? getGrid(sessionKey) : [],
          isRace ? getRetirements(sessionKey) : [],
          kind === "qualifying" ? getKnockouts(sessionKey) : [],
        ]),
      ]);
      if (token !== loadToken) return;
      const [weather, trackStatus, sessionStatus, pits, grid, retirements, knockouts] = extras;

      const timeline = buildTimeline(positions, intervals, laps, stints, raceControl);
      const outline = layout ?? (await traceOutline(sessionKey, timeline, replay));
      if (token !== loadToken) return;

      telemetryBuffer.reset(sessionKey, replay.start, replay.end);
      await telemetryBuffer.ensure(replay.start);
      if (token !== loadToken) return;

      const previous = get().selectedDriver;
      const selectedDriver = drivers.some((d) => d.driver_number === previous)
        ? previous
        : leaderAt(timeline, drivers, replay.start);

      set({
        drivers,
        timeline,
        // Keep the geometry published early so anything drawing it isn't restarted.
        track: get().track ?? (outline ? buildTrackGeometry(outline) : null),
        pitLoss: layout?.pitLoss ?? null,
        replay,
        cursor: replay.start,
        displayCursor: replay.start,
        selectedDriver,
        raceControl,
        weather,
        trackStatus,
        sessionStatus,
        pits,
        grid,
        retirements,
        knockouts,
        compare: compareFor(get().compare, timeline, drivers, replay.end),
        status: "ready",
        isPlaying: true,
      });
    } catch (error) {
      if (token === loadToken) set({ status: failed(error) });
    }
  },

  retry: async () => {
    const { session, sessions, year, loadYear, selectSession } = get();
    if (session && sessions.length > 0) await selectSession(session.session_key);
    else await loadYear(year);
  },

  togglePlay: () => {
    const { replay, cursor, isPlaying, seek } = get();
    if (!replay) return;
    if (!isPlaying && cursor >= replay.end) seek(replay.start);
    set({ isPlaying: !isPlaying });
  },

  setSpeed: (speed) => set({ speed }),

  seek: (time) => {
    const { replay, session } = get();
    if (!replay || !session) return;
    const cursor = Math.min(Math.max(time, replay.start), replay.end);
    if (!telemetryBuffer.covers(cursor)) {
      telemetryBuffer.reset(session.session_key, cursor, replay.end);
      void telemetryBuffer.ensure(cursor);
    }
    set({ cursor, displayCursor: cursor });
  },

  selectDriver: (driver) => set({ selectedDriver: driver }),

  // The replay only plays on the Pit Wall; the analysis views cover the whole session at once.
  setView: (view) => set((s) => ({ view, isPlaying: view === "pitwall" && s.isPlaying })),

  setCompare: (drivers) => set({ compare: drivers.slice(0, MAX_COMPARE) }),

  advance: (frameMs, now) => {
    const s = get();
    if (s.status !== "ready" || !s.replay) return;

    let { cursor, isPlaying } = s;
    let isBuffering = false;
    if (isPlaying) {
      const next = Math.min(cursor + Math.min(frameMs, MAX_FRAME_MS) * s.speed, s.replay.end);
      if (telemetryBuffer.isBuffered(next)) cursor = next;
      else isBuffering = true;
      if (cursor >= s.replay.end) isPlaying = false;
      void telemetryBuffer.ensure(cursor);
    }

    const patch: Partial<TelemetryState> = {};
    if (cursor !== s.cursor) patch.cursor = cursor;
    if (isPlaying !== s.isPlaying) patch.isPlaying = isPlaying;
    if (isBuffering !== s.isBuffering) patch.isBuffering = isBuffering;
    if (s.displayCursor !== cursor && (!isPlaying || now - lastDisplayUpdate >= DISPLAY_INTERVAL_MS)) {
      patch.displayCursor = cursor;
      lastDisplayUpdate = now;
    }
    if (Object.keys(patch).length > 0) set(patch);
  },
}));

telemetryBuffer.onChunk = () => useTelemetryStore.setState((s) => ({ bufferRevision: s.bufferRevision + 1 }));
