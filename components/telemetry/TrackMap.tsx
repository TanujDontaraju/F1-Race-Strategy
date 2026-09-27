"use client";

import { CloudRain, Crosshair, Maximize2, Minimize2 } from "lucide-react";
import { RefObject, useEffect, useMemo, useRef, useState } from "react";
import GlassPanel from "@/components/telemetry/GlassPanel";
import RaceControlFeed from "@/components/telemetry/RaceControlFeed";
import { telemetryBuffer } from "@/lib/telemetry/buffer";
import { sessionStats } from "@/lib/telemetry/derive";
import { drawTrack, TRACK_MAP_PADDING } from "@/lib/telemetry/drawTrack";
import { formatLapTime, parseDate, teamColour } from "@/lib/telemetry/format";
import { fitToBox, Point, projector, ScreenFit, TrackGeometry } from "@/lib/telemetry/geometry";
import { OFFLINE_MESSAGE, useTelemetryStore } from "@/lib/telemetry/store";

const CAR_RADIUS = 5;
const SELECTED_RADIUS = 7;
const HIT_RADIUS = 16;
const FOLLOW_ZOOM = 3;
// Seconds for the camera to close most of the distance to its target: quick enough to keep
// a car at full speed near the centre, slow enough that zooming in and out reads as motion.
const CAMERA_EASE_S = 0.18;

function drawStaticLayer(
  track: TrackGeometry,
  toScreen: (p: Point) => Point,
  width: number,
  height: number,
  dpr: number,
  fontFamily: string
): HTMLCanvasElement {
  const layer = document.createElement("canvas");
  layer.width = Math.round(width * dpr);
  layer.height = Math.round(height * dpr);
  const ctx = layer.getContext("2d")!;
  ctx.scale(dpr, dpr);
  drawTrack(ctx, track, toScreen, fontFamily);
  return layer;
}

function TrackCanvas({ track, followRef }: { track: TrackGeometry; followRef: RefObject<boolean> }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const screenPositions = useRef(new Map<number, Point>());
  const [size, setSize] = useState({ width: 0, height: 0 });
  const selectDriver = useTelemetryStore((s) => s.selectDriver);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width: Math.floor(width), height: Math.floor(height) });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || size.width === 0 || size.height === 0) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(size.width * dpr);
    canvas.height = Math.round(size.height * dpr);
    const fontFamily = getComputedStyle(canvas).fontFamily;
    const base = fitToBox(track.bounds, 0, 0, size.width, size.height, TRACK_MAP_PADDING);
    const staticLayer = drawStaticLayer(track, projector(track.bounds, base), size.width, size.height, dpr, fontFamily);
    const midX = (track.bounds.minX + track.bounds.maxX) / 2;
    const midY = (track.bounds.minY + track.bounds.maxY) / 2;

    let camera: ScreenFit = { ...base };
    let last = performance.now();
    let frame = 0;
    const draw = (now: number) => {
      const dt = Math.min(now - last, 100) / 1000;
      last = now;
      const { cursor, drivers, selectedDriver } = useTelemetryStore.getState();

      let target = base;
      const followed = followRef.current && selectedDriver != null ? telemetryBuffer.samplePosition(selectedDriver, cursor) : null;
      if (followed) {
        const w = track.toWorld(followed.x, followed.y);
        const scale = base.scale * FOLLOW_ZOOM;
        target = { scale, x: size.width / 2 - (w.x - midX) * scale, y: size.height / 2 + (w.y - midY) * scale };
      }
      const k = 1 - Math.exp(-dt / CAMERA_EASE_S);
      camera = {
        x: camera.x + (target.x - camera.x) * k,
        y: camera.y + (target.y - camera.y) * k,
        scale: camera.scale + (target.scale - camera.scale) * k,
      };
      const atRest = target === base && Math.abs(camera.scale - base.scale) < base.scale * 1e-3 &&
        Math.hypot(camera.x - base.x, camera.y - base.y) < 0.5;
      if (atRest) camera = { ...base };

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size.width, size.height);
      const toScreen = projector(track.bounds, camera);
      // The usual whole-circuit view reuses the pre-rendered track; a moving camera redraws it.
      if (atRest) ctx.drawImage(staticLayer, 0, 0, size.width, size.height);
      else drawTrack(ctx, track, toScreen, fontFamily);

      const positions = screenPositions.current;
      positions.clear();
      let selected: { p: Point; colour: string; label: string } | null = null;

      for (const driver of drivers) {
        const sample = telemetryBuffer.samplePosition(driver.driver_number, cursor);
        if (!sample) continue;
        const p = toScreen(track.toWorld(sample.x, sample.y));
        positions.set(driver.driver_number, p);
        const colour = teamColour(driver);
        if (driver.driver_number === selectedDriver) {
          selected = { p, colour, label: driver.name_acronym };
          continue;
        }
        ctx.fillStyle = colour;
        ctx.strokeStyle = "rgba(0, 0, 0, 0.65)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, CAR_RADIUS, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      // Selected car last so it sits on top, with a ring and its acronym.
      if (selected) {
        const { p, colour, label } = selected;
        ctx.fillStyle = colour;
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, SELECTED_RADIUS, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.font = `700 11px ${fontFamily}`;
        const textWidth = ctx.measureText(label).width;
        const pillW = textWidth + 14;
        const pillX = p.x - pillW / 2;
        const pillY = p.y - SELECTED_RADIUS - 24;
        ctx.fillStyle = "rgba(10, 10, 14, 0.85)";
        ctx.beginPath();
        ctx.roundRect(pillX, pillY, pillW, 18, 9);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(label, p.x, pillY + 9.5);
      }

      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [track, size, followRef]);

  // Selection responds on pointer-down, not release.
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    let closest: { driver: number; distance: number } | null = null;
    for (const [driver, p] of screenPositions.current) {
      const distance = Math.hypot(p.x - x, p.y - y);
      if (distance <= HIT_RADIUS && (!closest || distance < closest.distance)) closest = { driver, distance };
    }
    if (closest) selectDriver(closest.driver);
  };

  return (
    <div ref={containerRef} className="relative min-h-0 flex-1">
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        role="img"
        aria-label="Track map showing car positions"
        data-track-canvas
        className="absolute inset-0 h-full w-full cursor-pointer"
      />
    </div>
  );
}

function TrackStats() {
  const timeline = useTelemetryStore((s) => s.timeline);
  const drivers = useTelemetryStore((s) => s.drivers);
  const pitLoss = useTelemetryStore((s) => s.pitLoss);
  const displayCursor = useTelemetryStore((s) => s.displayCursor);

  const stats = useMemo(() => (timeline ? sessionStats(timeline, displayCursor) : null), [timeline, displayCursor]);
  const acronym = (n: number | undefined) => drivers.find((d) => d.driver_number === n)?.name_acronym ?? "";

  const items = [
    {
      label: "Fastest Lap",
      value: stats?.fastestLap ? formatLapTime(stats.fastestLap.duration) : "—",
      detail: acronym(stats?.fastestLap?.driver),
    },
    {
      label: "Speed Trap",
      value: stats?.topSpeed ? `${stats.topSpeed.speed} km/h` : "—",
      detail: acronym(stats?.topSpeed?.driver),
    },
    { label: "Pit Loss", value: pitLoss ? `${pitLoss.normal}s` : "—", detail: pitLoss ? `SC ${pitLoss.sc}s` : "" },
  ];

  return (
    <dl className="grid grid-cols-3 gap-2 px-6 pb-4 pt-1">
      {items.map((item) => (
        <div key={item.label} className="text-center">
          <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-white/55">{item.label}</dt>
          <dd className="mt-0.5 text-base font-semibold tabular-nums sm:text-lg">{item.value}</dd>
          <dd className="text-[11px] font-medium text-white/50">{item.detail}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Conditions at the playback moment. */
function WeatherNow() {
  const weather = useTelemetryStore((s) => s.weather);
  const time = useTelemetryStore((s) => s.displayCursor);
  const now = useMemo(() => {
    let latest = null;
    for (const row of weather) {
      if (parseDate(row.date) > time) break;
      latest = row;
    }
    return latest;
  }, [weather, time]);
  if (!now) return null;

  const reading = (label: string, value: number | null, unit: string) =>
    value == null ? null : (
      <span className="whitespace-nowrap">
        <span className="text-white/45">{label} </span>
        {Math.round(value)}
        {unit}
      </span>
    );

  return (
    <p className="hidden items-center gap-3 text-xs font-medium tabular-nums text-white/80 sm:flex" aria-label="Current weather">
      {reading("Air", now.air_temperature, "°")}
      {reading("Track", now.track_temperature, "°")}
      {reading("Wind", now.wind_speed == null ? null : now.wind_speed * 3.6, " km/h")}
      {(now.rainfall ?? 0) > 0 && (
        <span className="flex items-center gap-1 text-[#64d2ff]">
          <CloudRain size={14} aria-hidden /> Rain
        </span>
      )}
    </p>
  );
}

function IconToggle({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string;
  pressed: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-full text-white/70 transition-[background-color,color,transform] duration-150 ease-out hover:bg-white/10 hover:text-white active:scale-90 aria-pressed:bg-white/15 aria-pressed:text-white"
    >
      {children}
    </button>
  );
}

const UNAVAILABLE = "No timing data has been published for this session yet.";

export default function TrackMap() {
  const session = useTelemetryStore((s) => s.session);
  const track = useTelemetryStore((s) => s.track);
  const status = useTelemetryStore((s) => s.status);
  const raceWeek = useTelemetryStore((s) => s.raceWeek);
  const panelRef = useRef<HTMLElement>(null);
  const [follow, setFollow] = useState(false);
  const followRef = useRef(follow);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    followRef.current = follow;
  }, [follow]);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === panelRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void panelRef.current?.requestFullscreen();
  };

  const ready = status === "ready";
  const upcoming = status === "upcoming";

  return (
    <GlassPanel
      ref={panelRef}
      className="order-first flex min-h-[380px] flex-col lg:order-none lg:min-h-0"
      aria-label="Track map"
    >
      <header className="flex items-center justify-between gap-3 px-6 pt-5">
        <div className="min-w-0">
          <p className="text-xs font-medium text-white/60">
            {(upcoming ? raceWeek?.place : session?.circuit_short_name) ?? ""}
          </p>
          <p className="truncate text-lg font-bold tracking-tight">
            {(upcoming ? raceWeek?.name : session?.country_name) ?? "—"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {ready && <WeatherNow />}
          {ready && track && (
            <div className="flex items-center gap-0.5 rounded-full bg-black/25 p-0.5">
              <IconToggle label="Follow the selected car" pressed={follow} onClick={() => setFollow((f) => !f)}>
                <Crosshair size={16} />
              </IconToggle>
              <IconToggle label={fullscreen ? "Exit full screen" : "Full screen"} pressed={fullscreen} onClick={toggleFullscreen}>
                {fullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
              </IconToggle>
            </div>
          )}
        </div>
      </header>

      {/* The circuit outline usually arrives before the session's data, so it shows while that loads. */}
      {track && status !== "error" && status !== "offline" ? (
        <TrackCanvas track={track} followRef={followRef} />
      ) : (
        <div className="flex flex-1 items-center justify-center px-8 text-center text-sm text-white/55">
          {status === "loading" && "Loading session…"}
          {status === "unavailable" && UNAVAILABLE}
          {status === "error" && "Couldn't load this session."}
          {status === "offline" && OFFLINE_MESSAGE}
          {(ready || upcoming) && "Track layout unavailable for this circuit."}
        </div>
      )}

      {ready && <TrackStats />}
      {ready && <RaceControlFeed />}
      {track && (status === "loading" || status === "unavailable") && (
        <p className="px-8 pb-5 pt-1 text-center text-xs font-medium text-white/55">
          {status === "loading" ? "Loading session…" : UNAVAILABLE}
        </p>
      )}
    </GlassPanel>
  );
}
