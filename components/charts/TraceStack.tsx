"use client";

import { scaleLinear } from "d3-scale";
import { curveLinear, curveStepAfter, line } from "d3-shape";
import { KeyboardEvent, PointerEvent, useMemo, useState } from "react";
import { AXIS_TEXT, GRID, LineKey, SURFACE, TICK_FONT, useElementWidth } from "@/components/charts/common";
import { interpolate, nearest } from "@/lib/telemetry/lapAnalysis";
import { DASH } from "@/lib/telemetry/seriesColours";

export interface TraceSeries {
  key: number | string;
  label: string;
  colour: string;
  dashed?: boolean;
  x: number[];
  y: number[];
}

export interface Trace {
  id: string;
  title: string;
  height: number;
  series: TraceSeries[];
  format: (value: number) => string;
  domain?: [number, number];
  ticks?: number[];
  /** Stepped channels (gear, brake) read the nearest sample instead of interpolating. */
  step?: boolean;
}

const MARGIN = { left: 48, right: 12 };
const GAP = 10;
const AXIS_H = 22;
// Arrow keys move the crosshair this far along the lap.
const KEY_STEP_M = 50;

function TracePlot({
  trace,
  width,
  length,
  hover,
  onHover,
}: {
  trace: Trace;
  width: number;
  length: number;
  hover: number | null;
  onHover: (distance: number | null) => void;
}) {
  const plotW = Math.max(0, width - MARGIN.left - MARGIN.right);
  const x = useMemo(() => scaleLinear().domain([0, length]).range([0, plotW]), [length, plotW]);
  const y = useMemo(() => {
    const all = trace.series.flatMap((s) => s.y);
    const domain = trace.domain ?? [Math.min(...all), Math.max(...all)];
    const scale = scaleLinear().domain(domain).range([trace.height - 4, 4]);
    return trace.domain ? scale : scale.nice(2);
  }, [trace]);
  const paths = useMemo(
    () =>
      trace.series.map((s) => {
        const points = s.x.map((d, i) => [x(d), y(s.y[i])] as [number, number]);
        return line<[number, number]>().curve(trace.step ? curveStepAfter : curveLinear)(points) ?? "";
      }),
    [trace, x, y]
  );

  const readValue = (s: TraceSeries, d: number) => (trace.step ? nearest(s.x, s.y, d) : interpolate(s.x, s.y, d));
  // Short traces only have room for a couple of labels.
  const ticks = trace.ticks ?? y.ticks(trace.height < 100 ? 2 : 4);

  return (
    <div>
      <div className="flex min-h-5 flex-wrap items-baseline justify-between gap-x-4 px-1">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-white/55">{trace.title}</p>
        {hover != null && (
          <p className="flex flex-wrap items-center gap-x-3 text-xs" aria-live="off">
            {trace.series.map((s) => (
              <span key={s.key} className="flex items-center gap-1.5">
                <LineKey colour={s.colour} dashed={s.dashed} width={10} />
                <span className="font-semibold tabular-nums">{trace.format(readValue(s, hover))}</span>
                <span className="text-white/50">{s.label}</span>
              </span>
            ))}
          </p>
        )}
      </div>
      <svg width={width} height={trace.height} aria-hidden>
        <g transform={`translate(${MARGIN.left},0)`}>
          {ticks.map((t) => (
            <g key={t} transform={`translate(0,${y(t)})`}>
              <line x2={plotW} stroke={GRID} />
              <text x={-8} dy="0.32em" textAnchor="end" fill={AXIS_TEXT} style={TICK_FONT}>
                {trace.format(t)}
              </text>
            </g>
          ))}
          {trace.series.map((s, i) => (
            <path
              key={s.key}
              d={paths[i]}
              fill="none"
              stroke={s.colour}
              strokeWidth={trace.step ? 1.5 : 2}
              strokeLinejoin="round"
              strokeDasharray={s.dashed ? DASH : undefined}
            />
          ))}
          {hover != null && (
            <g pointerEvents="none">
              <line x1={x(hover)} x2={x(hover)} y2={trace.height} stroke="rgba(255,255,255,0.3)" />
              {trace.series.map((s) => (
                <circle
                  key={s.key}
                  cx={x(hover)}
                  cy={y(readValue(s, hover))}
                  r={3.5}
                  fill={s.colour}
                  stroke={SURFACE}
                  strokeWidth={2}
                />
              ))}
            </g>
          )}
          <rect
            width={plotW}
            height={trace.height}
            fill="transparent"
            onPointerMove={(e: PointerEvent<SVGRectElement>) =>
              onHover(x.invert(e.clientX - e.currentTarget.getBoundingClientRect().left))
            }
            onPointerLeave={() => onHover(null)}
          />
        </g>
      </svg>
    </div>
  );
}

/** Channels stacked against distance round the lap, sharing one crosshair. */
export default function TraceStack({ traces, length, label }: { traces: Trace[]; length: number; label: string }) {
  const [containerRef, width] = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const plotW = Math.max(0, width - MARGIN.left - MARGIN.right);
  const x = scaleLinear().domain([0, length]).range([0, plotW]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const next =
      e.key === "ArrowRight" ? Math.min((hover ?? 0) + KEY_STEP_M, length)
      : e.key === "ArrowLeft" ? Math.max((hover ?? 0) - KEY_STEP_M, 0)
      : e.key === "Home" ? 0
      : e.key === "End" ? length
      : null;
    if (next == null) return;
    e.preventDefault();
    setHover(next);
  };

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={label}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onFocus={() => setHover((h) => h ?? 0)}
      onBlur={() => setHover(null)}
      className="flex flex-col rounded-lg outline-none focus-visible:ring-1 focus-visible:ring-white/40"
      style={{ gap: GAP }}
    >
      {width > 0 && (
        <>
          {traces.map((trace) => (
            <TracePlot key={trace.id} trace={trace} width={width} length={length} hover={hover} onHover={setHover} />
          ))}
          <svg width={width} height={AXIS_H} aria-hidden>
            <g transform={`translate(${MARGIN.left},0)`}>
              {x
                .ticks(Math.max(2, Math.floor(plotW / 90)))
                .filter((t) => hover == null || Math.abs(x(t) - x(hover)) > 36)
                .map((t) => (
                  <text key={t} x={x(t)} y={12} textAnchor="middle" fill={AXIS_TEXT} style={TICK_FONT}>
                    {t >= 1000 ? `${(t / 1000).toFixed(1)} km` : `${t} m`}
                  </text>
                ))}
              {hover != null && (
                <text x={x(hover)} y={12} textAnchor="middle" fill="white" fontSize={11} fontWeight={700}>
                  {Math.round(hover)} m
                </text>
              )}
            </g>
          </svg>
        </>
      )}
    </div>
  );
}
