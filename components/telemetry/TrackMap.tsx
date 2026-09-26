"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import GlassPanel from "@/components/telemetry/GlassPanel";
import { telemetryBuffer } from "@/lib/telemetry/buffer";
import { sessionStats } from "@/lib/telemetry/derive";
import { formatLapTime, teamColour } from "@/lib/telemetry/format";
import { fitToCanvas, Point, TrackGeometry } from "@/lib/telemetry/geometry";
import { useTelemetryStore } from "@/lib/telemetry/store";

const PADDING = 40;
const CAR_RADIUS = 5;
const SELECTED_RADIUS = 7;
const HIT_RADIUS = 16;

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

  const points = track.outline.map(toScreen);
  const path = new Path2D();
  points.forEach((p, i) => (i === 0 ? path.moveTo(p.x, p.y) : path.lineTo(p.x, p.y)));
  path.closePath();

  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(255, 255, 255, 0.07)";
  ctx.lineWidth = 16;
  ctx.stroke(path);
  ctx.shadowColor = "rgba(255, 255, 255, 0.6)";
  ctx.shadowBlur = 14;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.92)";
  ctx.lineWidth = 3.5;
  ctx.stroke(path);
  ctx.shadowBlur = 0;

  // Start/finish line: a short bar across the track at the first outline point.
  if (points.length > 1) {
    const [a, b] = points;
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const nx = -(b.y - a.y) / len;
    const ny = (b.x - a.x) / len;
    ctx.strokeStyle = "#e10600";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(a.x - nx * 9, a.y - ny * 9);
    ctx.lineTo(a.x + nx * 9, a.y + ny * 9);
    ctx.stroke();
  }

  ctx.font = `600 10px ${fontFamily}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const corner of track.corners) {
    const p = toScreen(corner);
    ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
    ctx.fillText(String(corner.number), p.x, p.y + 0.5);
  }
  return layer;
}

function TrackCanvas({ track }: { track: TrackGeometry }) {
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
    const toScreen = fitToCanvas(track.bounds, size.width, size.height, PADDING);
    const staticLayer = drawStaticLayer(track, toScreen, size.width, size.height, dpr, fontFamily);

    let frame = 0;
    const draw = () => {
      const { cursor, drivers, selectedDriver } = useTelemetryStore.getState();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size.width, size.height);
      ctx.drawImage(staticLayer, 0, 0, size.width, size.height);

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
  }, [track, size]);

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
    <dl className="grid grid-cols-3 gap-2 px-6 pb-5 pt-1">
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

export default function TrackMap() {
  const session = useTelemetryStore((s) => s.session);
  const track = useTelemetryStore((s) => s.track);
  const status = useTelemetryStore((s) => s.status);

  return (
    <GlassPanel className="order-first flex min-h-[380px] flex-col lg:order-none lg:min-h-0" aria-label="Track map">
      <header className="flex items-center justify-between gap-3 px-6 pt-5">
        <div className="min-w-0">
          <p className="text-xs font-medium text-white/60">{session?.circuit_short_name ?? ""}</p>
          <p className="truncate text-lg font-bold tracking-tight">{session?.country_name ?? "—"}</p>
        </div>
        {session && (
          <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold tracking-[0.04em] text-white/80">
            {session.session_name}
          </span>
        )}
      </header>

      {status === "ready" && track ? (
        <TrackCanvas track={track} />
      ) : (
        <div className="flex flex-1 items-center justify-center px-8 text-center text-sm text-white/55">
          {status === "loading" && "Loading session…"}
          {status === "unavailable" &&
            "No telemetry captured for this session yet. Mock data covers the Monza race and Baku qualifying; live OpenF1 data comes in the next phase."}
          {status === "error" && "Couldn't load this session."}
          {status === "ready" && !track && "Track layout unavailable for this circuit."}
        </div>
      )}

      {status === "ready" && <TrackStats />}
    </GlassPanel>
  );
}
