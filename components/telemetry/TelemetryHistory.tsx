"use client";

import { area, line } from "d3-shape";
import { telemetryBuffer } from "@/lib/telemetry/buffer";

const WINDOW_MS = 30_000;
const WIDTH = 300;
const SPEED_HEIGHT = 56;
const BAND_HEIGHT = 10;
const MAX_SPEED = 360;

/** The last 30 seconds of a car's speed, with throttle and brake as thin bands underneath. */
export default function TelemetryHistory({ driver, time }: { driver: number; time: number }) {
  const history = telemetryBuffer.carHistory(driver, time - WINDOW_MS, time);
  if (history.t.length < 2) return null;

  const x = (t: number) => ((t - (time - WINDOW_MS)) / WINDOW_MS) * WIDTH;
  const points = history.t.map((t, i) => i);
  const speedPath = line<number>()
    .x((i) => x(history.t[i]))
    .y((i) => SPEED_HEIGHT - (Math.min(history.speed[i], MAX_SPEED) / MAX_SPEED) * SPEED_HEIGHT)(points);
  const band = (values: number[]) =>
    area<number>()
      .x((i) => x(history.t[i]))
      .y0(BAND_HEIGHT)
      .y1((i) => BAND_HEIGHT - (Math.min(values[i], 100) / 100) * BAND_HEIGHT)(points);

  return (
    <figure className="mt-3" aria-label="Speed, throttle and brake over the last 30 seconds">
      <figcaption className="mb-1.5 flex justify-between text-[11px] font-medium uppercase tracking-[0.08em] text-white/55">
        <span>Last 30 s</span>
        <span className="normal-case tracking-normal text-white/40">speed · throttle · brake</span>
      </figcaption>
      <svg viewBox={`0 0 ${WIDTH} ${SPEED_HEIGHT}`} preserveAspectRatio="none" className="h-14 w-full" aria-hidden>
        {[120, 240].map((kmh) => (
          <line
            key={kmh}
            x1={0}
            x2={WIDTH}
            y1={SPEED_HEIGHT - (kmh / MAX_SPEED) * SPEED_HEIGHT}
            y2={SPEED_HEIGHT - (kmh / MAX_SPEED) * SPEED_HEIGHT}
            stroke="rgba(255,255,255,0.08)"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        <path d={speedPath ?? ""} fill="none" stroke="#f5f5f7" strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <svg viewBox={`0 0 ${WIDTH} ${BAND_HEIGHT}`} preserveAspectRatio="none" className="mt-1.5 h-2.5 w-full" aria-hidden>
        <path d={band(history.throttle) ?? ""} fill="#30d158" fillOpacity={0.85} />
      </svg>
      <svg viewBox={`0 0 ${WIDTH} ${BAND_HEIGHT}`} preserveAspectRatio="none" className="mt-1 h-2.5 w-full" aria-hidden>
        <path d={band(history.brake) ?? ""} fill="#ff453a" fillOpacity={0.85} />
      </svg>
    </figure>
  );
}
