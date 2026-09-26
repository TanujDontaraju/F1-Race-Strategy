"use client";

import { ArrowRight } from "lucide-react";
import Image from "next/image";
import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { drawTrack, TRACK_MAP_PADDING } from "@/lib/telemetry/drawTrack";
import { buildFormationLap, FormationLap } from "@/lib/telemetry/formationLap";
import { Bounds, fitToBox, Point, projector, ScreenFit } from "@/lib/telemetry/geometry";
import { useTelemetryStore } from "@/lib/telemetry/store";

// The car waits on the grid this long before launching.
const GRID_PAUSE = 0.45;
// A tap or key press during the opening lap finishes drawing the circuit over this long.
const SKIP_SECONDS = 0.35;
const START_GLOW_SECONDS = 0.9;
// Critically damped spring (Apple's "response", in seconds) for the flight into the track map.
const FLIGHT_RESPONSE = 0.55;
const CAR_FADE_SECONDS = 0.15;
const FADE_MS = 300;
const TRAIL_PX = 70;
const TRAIL_STEPS = 14;

type Leaving = "flight" | "fade" | null;

interface IntroScreenProps {
  /** The user entered; `flight` means the track will fly into the dashboard's track map. */
  onLeave: (flight: boolean) => void;
  onDone: () => void;
}

const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const easeOut = (t: number) => 1 - (1 - Math.min(Math.max(t, 0), 1)) ** 3;

/** The circuit sits in the upper part of the screen, leaving room for the title and button. */
function introFit(bounds: Bounds, width: number, height: number): ScreenFit {
  const reserve = Math.min(280, height * 0.38);
  const padding = Math.max(32, Math.min(width, height) * 0.08);
  return fitToBox(bounds, 0, 0, width, height - reserve, padding);
}

/** A glowing car with a short red trail; the trail never reaches back past `trailFloor`. */
function drawCar(
  ctx: CanvasRenderingContext2D,
  lap: FormationLap,
  distance: number,
  trailFloor: number,
  toScreen: (p: Point) => Point,
  scale: number,
  alpha: number
) {
  const from = Math.max(distance - TRAIL_PX / scale, trailFloor);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineCap = "butt";
  ctx.lineWidth = 3.5;
  let head = toScreen(lap.pointAt(from));
  for (let i = 1; i <= TRAIL_STEPS; i++) {
    const p = toScreen(lap.pointAt(from + ((distance - from) * i) / TRAIL_STEPS));
    ctx.strokeStyle = `rgba(255, 30, 10, ${0.9 * (i / TRAIL_STEPS) ** 1.6})`;
    ctx.beginPath();
    ctx.moveTo(head.x, head.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    head = p;
  }
  const glow = ctx.createRadialGradient(head.x, head.y, 0, head.x, head.y, 18);
  glow.addColorStop(0, "rgba(255, 60, 40, 0.6)");
  glow.addColorStop(1, "rgba(225, 6, 0, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(head.x, head.y, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(head.x, head.y, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function Rise({ shown, delay = 0, children }: { shown: boolean; delay?: number; children: ReactNode }) {
  return (
    <div className="intro-rise" data-shown={shown} style={{ transitionDelay: shown ? `${delay}ms` : "0ms" }}>
      {children}
    </div>
  );
}

/**
 * A formation lap round this weekend's circuit while the dashboard loads behind
 * it. On entering, the drawn circuit flies into the track map, where the
 * dashboard's own copy takes over.
 */
export default function IntroScreen({ onLeave, onDone }: IntroScreenProps) {
  const session = useTelemetryStore((s) => s.session);
  const track = useTelemetryStore((s) => s.track);
  const status = useTelemetryStore((s) => s.status);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const control = useRef<{ skip: boolean; flightTo: ScreenFit | null }>({ skip: false, flightTo: null });
  const onDoneRef = useRef(onDone);
  const [lapDone, setLapDone] = useState(false);
  const [leaving, setLeaving] = useState<Leaving>(null);

  const loaded = status !== "loading";
  const ready = loaded && (lapDone || !track);

  useEffect(() => {
    onDoneRef.current = onDone;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !track) return;

    const lap = buildFormationLap(track.outline);
    const fontFamily = getComputedStyle(canvas).fontFamily;
    const still = prefersReducedMotion();
    const c = control.current;
    let clock = 0;
    let last = performance.now();
    let lapDoneAt: number | null = null;
    let skipAt: number | null = null;
    let flightStart: number | null = null;
    let flightFrom: ScreenFit | null = null;
    let frame = 0;

    const loop = (now: number) => {
      // Capped so a backgrounded tab doesn't come back mid-lap.
      clock += Math.min(now - last, 100) / 1000;
      last = now;

      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const driving = clock - GRID_PAUSE;
      const opening = driving < lap.firstLapSeconds;
      const distance = opening
        ? lap.firstLapDistance(driving)
        : lap.lapDistance((driving - lap.firstLapSeconds) % lap.lapSeconds);

      if (c.skip && skipAt === null) skipAt = clock;
      let drawn = still ? 1 : opening ? distance / lap.length : 1;
      if (skipAt !== null) drawn = Math.max(drawn, easeOut((clock - skipAt) / SKIP_SECONDS));
      if (drawn >= 1 && lapDoneAt === null) {
        lapDoneAt = clock;
        setLapDone(true);
      }

      let fit = introFit(track.bounds, width, height);
      let landed = false;
      if (c.flightTo) {
        if (flightStart === null) {
          flightStart = clock;
          flightFrom = fit;
        }
        const omega = (2 * Math.PI) / FLIGHT_RESPONSE;
        const t = clock - flightStart;
        const remaining = (1 + omega * t) * Math.exp(-omega * t);
        const to = c.flightTo;
        const from = flightFrom ?? fit;
        landed = remaining < 0.001;
        fit = landed
          ? to
          : {
              x: to.x + (from.x - to.x) * remaining,
              y: to.y + (from.y - to.y) * remaining,
              scale: to.scale + (from.scale - to.scale) * remaining,
            };
      }

      const toScreen = projector(track.bounds, fit);
      const startGlow =
        still || lapDoneAt === null ? 0 : Math.max(0, 1 - (clock - lapDoneAt) / START_GLOW_SECONDS);
      drawTrack(ctx, track, toScreen, fontFamily, { drawn: Math.min(drawn, 1), startGlow });

      const carAlpha = still
        ? 0
        : flightStart === null
          ? 1
          : Math.max(0, 1 - (clock - flightStart) / CAR_FADE_SECONDS);
      if (carAlpha > 0) drawCar(ctx, lap, distance, opening ? 0 : -Infinity, toScreen, fit.scale, carAlpha);

      if (landed) {
        onDoneRef.current();
        return;
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [track]);

  // Measured after the page has laid the dashboard out for real, so the landing spot is exact.
  useLayoutEffect(() => {
    if (leaving !== "flight" || !track) return;
    const target = document.querySelector<HTMLElement>("[data-track-canvas]");
    if (!target) {
      onDoneRef.current();
      return;
    }
    const r = target.getBoundingClientRect();
    control.current.flightTo = fitToBox(
      track.bounds,
      r.left,
      r.top,
      Math.floor(r.width),
      Math.floor(r.height),
      TRACK_MAP_PADDING
    );
  }, [leaving, track]);

  useEffect(() => {
    if (leaving !== "fade") return;
    const timer = setTimeout(() => onDoneRef.current(), FADE_MS);
    return () => clearTimeout(timer);
  }, [leaving]);

  const enter = () => {
    if (leaving || !ready) return;
    const flight = !prefersReducedMotion() && !!track && !!document.querySelector("[data-track-canvas]");
    setLeaving(flight ? "flight" : "fade");
    onLeave(flight);
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || e.target instanceof HTMLButtonElement) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (ready) enter();
        else control.current.skip = true;
      } else if (e.key === "Escape") {
        control.current.skip = true;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden transition-opacity ease-out"
      style={{
        opacity: leaving === "fade" ? 0 : 1,
        transitionDuration: `${FADE_MS}ms`,
        pointerEvents: leaving ? "none" : undefined,
      }}
      onPointerDown={() => {
        if (!lapDone) control.current.skip = true;
      }}
    >
      {/* Same backdrop as the dashboard, so fading it out reveals the dashboard without a seam. */}
      <div
        className="pitwall-ambient absolute inset-0 transition-opacity duration-[450ms] ease-in-out"
        style={{ opacity: leaving === "flight" ? 0 : 1 }}
      />
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={session ? `${session.circuit_short_name} circuit` : "Circuit"}
        className="absolute inset-0 h-full w-full transition-opacity duration-700 ease-out"
        style={{ opacity: track ? 1 : 0 }}
      />

      <div
        className="absolute inset-x-0 bottom-0 flex flex-col items-center px-6 pb-[max(2.5rem,7vh)] text-center transition-[opacity,transform] duration-150 ease-out"
        style={leaving ? { opacity: 0, transform: "translateY(6px)" } : undefined}
      >
        <Rise shown={!!session} delay={250}>
          <Image src="/f1-logo.png" alt="Formula 1" width={666} height={375} className="h-auto w-14" />
        </Rise>
        <Rise shown={!!session} delay={330}>
          <h2 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">{session?.country_name}</h2>
        </Rise>
        <Rise shown={!!session} delay={410}>
          <p className="mt-2 text-sm font-medium text-white/60">
            {session && `${session.circuit_short_name} · ${session.session_name}`}
          </p>
        </Rise>

        <div className="mt-8 grid h-12 place-items-center">
          <p aria-live="polite" className="col-start-1 row-start-1 text-sm font-medium text-white/50">
            {lapDone && !loaded ? "Loading session…" : ""}
          </p>
          <div className="col-start-1 row-start-1">
            <Rise shown={ready}>
              <button
                type="button"
                onClick={enter}
                disabled={!ready}
                className="intro-cta group flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-white outline-none transition-[background-color,transform] duration-150 ease-out active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-white/50"
              >
                Enter the pit lane
                <ArrowRight
                  size={16}
                  aria-hidden
                  className="transition-transform duration-200 ease-out group-hover:translate-x-0.5"
                />
              </button>
            </Rise>
          </div>
        </div>
      </div>
    </div>
  );
}
