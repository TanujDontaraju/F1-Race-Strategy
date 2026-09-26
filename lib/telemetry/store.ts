import { create } from "zustand";
import {
  getAvailableYears,
  getCircuitLayout,
  getDrivers,
  getLaps,
  getLocations,
  getPositions,
  getRaceControl,
  getReplayWindow,
  getSessions,
  getStints,
} from "@/lib/telemetry/api";
import { telemetryBuffer } from "@/lib/telemetry/buffer";
import { buildTimeline, positionAt, SessionTimeline } from "@/lib/telemetry/derive";
import { parseDate } from "@/lib/telemetry/format";
import { buildTrackGeometry, TrackGeometry } from "@/lib/telemetry/geometry";
import { CircuitLayout, Driver, ReplayWindow, Session } from "@/lib/telemetry/types";

export type PlaybackSpeed = 1 | 5 | 10;
export const PLAYBACK_SPEEDS: PlaybackSpeed[] = [1, 5, 10];

export type LoadStatus = "loading" | "ready" | "unavailable" | "error";

// React panels re-render off `displayCursor`, refreshed at this interval; the
// track map reads `cursor` directly every animation frame instead.
const DISPLAY_INTERVAL_MS = 200;
// Caps the catch-up jump when the tab regains focus after requestAnimationFrame paused.
const MAX_FRAME_MS = 100;

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

  loadYear: (year: number) => Promise<void>;
  selectSession: (sessionKey: number) => Promise<void>;
  togglePlay: () => void;
  setSpeed: (speed: PlaybackSpeed) => void;
  seek: (time: number) => void;
  selectDriver: (driver: number) => void;
  advance: (frameMs: number, now: number) => void;
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

  loadYear: async (year) => {
    set({ year, sessions: [], session: null, status: "loading" });
    const sessions = await getSessions(year);
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
    });

    try {
      const replay = await getReplayWindow(session);
      if (token !== loadToken) return;
      if (!replay) {
        set({ status: "unavailable" });
        return;
      }

      const [drivers, positions, stints, laps, raceControl, layout] = await Promise.all([
        getDrivers(sessionKey),
        getPositions(sessionKey, replay.end),
        getStints(sessionKey),
        getLaps(sessionKey, replay.end),
        getRaceControl(sessionKey, replay.end),
        getCircuitLayout(session.circuit_key, session.year),
      ]);
      if (token !== loadToken) return;

      const timeline = buildTimeline(positions, laps, stints, raceControl);
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
        track: outline ? buildTrackGeometry(outline) : null,
        pitLoss: layout?.pitLoss ?? null,
        replay,
        cursor: replay.start,
        displayCursor: replay.start,
        selectedDriver,
        status: "ready",
        isPlaying: true,
      });
    } catch {
      if (token === loadToken) set({ status: "error" });
    }
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
