"use client";

import { scaleLinear } from "d3-scale";
import { curveLinear, curveStepAfter, line } from "d3-shape";
import { KeyboardEvent, PointerEvent, useMemo, useState } from "react";
import {
  AXIS_TEXT,
  GRID,
  Legend,
  LineKey,
  SURFACE,
  TICK_FONT,
  Tooltip,
  TooltipRow,
  useElementWidth,
} from "@/components/charts/common";
import { DASH } from "@/lib/telemetry/seriesColours";

export interface LinePoint {
  x: number;
  /** null leaves a gap in the line. */
  y: number | null;
}

export interface LineSeries {
  key: number | string;
  label: string;
  colour: string;
  dashed?: boolean;
  points: LinePoint[];
}

/** A shaded stretch of the x axis, e.g. laps behind the safety car. */
export interface XBand {
  from: number;
  to: number;
  label: string;
}

interface LineChartProps {
  series: LineSeries[];
  label: string;
  formatY: (value: number) => string;
  /** Axis ticks, when they want fewer digits than the tooltip. */
  formatTick?: (value: number) => string;
  formatX?: (value: number) => string;
  xTitle?: string;
  height?: number;
  /** Smaller values at the top, as for positions. */
  invertY?: boolean;
  yDomain?: [number, number];
  /** Start the y axis at zero rather than just below the data. */
  zeroBased?: boolean;
  yTicks?: number[];
  step?: boolean;
  bands?: XBand[];
}

const MARGIN = { top: 12, right: 48, bottom: 30, left: 56 };
// End labels closer than this collide; the legend and tooltip carry those series instead.
const LABEL_GAP = 13;

/** Lines against a shared x (laps), with a snapping crosshair, one tooltip for every series, and end labels. */
export default function LineChart({
  series,
  label,
  formatY,
  formatTick = formatY,
  formatX = (x) => `Lap ${x}`,
  xTitle = "Lap",
  height = 280,
  invertY = false,
  yDomain,
  zeroBased = false,
  yTicks,
  step = false,
  bands = [],
}: LineChartProps) {
  const [containerRef, width] = useElementWidth<HTMLDivElement>();
  const [hoverX, setHoverX] = useState<number | null>(null);

  const xs = useMemo(
    () => [...new Set(series.flatMap((s) => s.points.filter((p) => p.y != null).map((p) => p.x)))].sort((a, b) => a - b),
    [series]
  );
  const plotW = Math.max(0, width - MARGIN.left - MARGIN.right);
  const plotH = height - MARGIN.top - MARGIN.bottom;

  const { x, y } = useMemo(() => {
    const ys = series.flatMap((s) => s.points.map((p) => p.y).filter((v): v is number => v != null));
    const [lo, hi] = yDomain ?? [Math.min(...ys), Math.max(...ys)];
    const pad = yDomain ? 0 : (hi - lo) * 0.06 || 1;
    const y = scaleLinear()
      .domain([zeroBased ? Math.min(0, lo) : lo - pad, hi + pad])
      .range(invertY ? [0, plotH] : [plotH, 0]);
    if (!yDomain) y.nice(5);
    const x = scaleLinear()
      .domain([xs[0] ?? 0, xs.at(-1) ?? 1])
      .range([0, plotW])
      .clamp(true);
    return { x, y };
  }, [series, xs, yDomain, zeroBased, invertY, plotW, plotH]);

  const path = useMemo(
    () =>
      line<LinePoint>()
        .defined((p) => p.y != null)
        .x((p) => x(p.x))
        .y((p) => y(p.y!))
        .curve(step ? curveStepAfter : curveLinear),
    [x, y, step]
  );

  // End labels at each series' last point, skipping any that would collide.
  const endLabels = useMemo(() => {
    const ends = series
      .map((s) => {
        const last = s.points.findLast((p) => p.y != null);
        return last ? { s, px: x(last.x), py: y(last.y!) } : null;
      })
      .filter((e) => e != null)
      .sort((a, b) => a.py - b.py);
    const kept: typeof ends = [];
    for (const end of ends) {
      if (kept.every((k) => Math.abs(k.py - end.py) >= LABEL_GAP)) kept.push(end);
    }
    return kept;
  }, [series, x, y]);

  const xTicks = x.ticks(Math.max(2, Math.floor(plotW / 70))).filter(Number.isInteger);
  const ticksY = yTicks ?? y.ticks(5);

  const snap = (px: number) => {
    if (xs.length === 0) return null;
    const target = x.invert(px);
    return xs.reduce((best, v) => (Math.abs(v - target) < Math.abs(best - target) ? v : best), xs[0]);
  };
  const onPointerMove = (e: PointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setHoverX(snap(e.clientX - rect.left));
  };
  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    if (xs.length === 0) return;
    const i = hoverX == null ? xs.length - 1 : xs.indexOf(hoverX);
    const next =
      e.key === "ArrowRight" ? Math.min(i + 1, xs.length - 1)
      : e.key === "ArrowLeft" ? Math.max(i - 1, 0)
      : e.key === "Home" ? 0
      : e.key === "End" ? xs.length - 1
      : null;
    if (next == null) return;
    e.preventDefault();
    setHoverX(xs[next]);
  };

  const hovered =
    hoverX == null
      ? []
      : series
          .map((s) => ({ s, p: s.points.find((p) => p.x === hoverX && p.y != null) }))
          .filter((h): h is { s: LineSeries; p: LinePoint } => h.p != null)
          .sort((a, b) => (invertY ? a.p.y! - b.p.y! : b.p.y! - a.p.y!));

  return (
    <div className="flex flex-col gap-3">
      {series.length > 1 && (
        <Legend
          items={series.map((s) => ({
            key: s.key,
            label: s.label,
            swatch: <LineKey colour={s.colour} dashed={s.dashed} />,
          }))}
        />
      )}
      <div ref={containerRef} className="relative" style={{ height }}>
        {width > 0 && (
          <svg
            width={width}
            height={height}
            role="img"
            aria-label={label}
            tabIndex={0}
            onKeyDown={onKeyDown}
            onFocus={() => setHoverX((h) => h ?? xs.at(-1) ?? null)}
            onBlur={() => setHoverX(null)}
            className="rounded-lg outline-none focus-visible:ring-1 focus-visible:ring-white/40"
          >
            <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
              {bands.map((b, i) => (
                <g key={i}>
                  <rect
                    x={x(b.from)}
                    width={Math.max(2, x(b.to) - x(b.from))}
                    y={0}
                    height={plotH}
                    fill="rgba(255,255,255,0.045)"
                  />
                  <text x={x(b.from) + 4} y={10} fill={AXIS_TEXT} fontSize={10} fontWeight={600}>
                    {b.label}
                  </text>
                </g>
              ))}

              {ticksY.map((t) => (
                <g key={t} transform={`translate(0,${y(t)})`}>
                  <line x2={plotW} stroke={GRID} />
                  <text x={-10} dy="0.32em" textAnchor="end" fill={AXIS_TEXT} style={TICK_FONT}>
                    {formatTick(t)}
                  </text>
                </g>
              ))}
              <line y1={plotH} y2={plotH} x2={plotW} stroke={GRID} />
              {xTicks.map((t) => (
                <text key={t} x={x(t)} y={plotH + 18} textAnchor="middle" fill={AXIS_TEXT} style={TICK_FONT}>
                  {t}
                </text>
              ))}
              <text x={plotW} y={plotH + 18} dx={12} fill={AXIS_TEXT} fontSize={10}>
                {xTitle}
              </text>

              {series.map((s) => (
                <path
                  key={s.key}
                  d={path(s.points) ?? undefined}
                  fill="none"
                  stroke={s.colour}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  strokeDasharray={s.dashed ? DASH : undefined}
                />
              ))}

              {endLabels.map(({ s, px, py }) => (
                <text
                  key={s.key}
                  x={px + 8}
                  y={py}
                  dy="0.32em"
                  fill="rgba(255,255,255,0.8)"
                  fontSize={11}
                  fontWeight={700}
                >
                  {s.label}
                </text>
              ))}

              {hoverX != null && (
                <g pointerEvents="none">
                  <line x1={x(hoverX)} x2={x(hoverX)} y2={plotH} stroke="rgba(255,255,255,0.3)" />
                  {hovered.map(({ s, p }) => (
                    <circle
                      key={s.key}
                      cx={x(p.x)}
                      cy={y(p.y!)}
                      r={4}
                      fill={s.colour}
                      stroke={SURFACE}
                      strokeWidth={2}
                    />
                  ))}
                </g>
              )}

              <rect
                width={plotW}
                height={plotH}
                fill="transparent"
                onPointerMove={onPointerMove}
                onPointerLeave={() => setHoverX(null)}
              />
            </g>
          </svg>
        )}
        {hoverX != null && hovered.length > 0 && (
          <Tooltip x={MARGIN.left + x(hoverX)} width={width}>
            <p className="mb-1 font-semibold text-white/60">{formatX(hoverX)}</p>
            {hovered.map(({ s, p }) => (
              <TooltipRow
                key={s.key}
                swatch={<LineKey colour={s.colour} dashed={s.dashed} width={12} />}
                value={formatY(p.y!)}
                label={s.label}
              />
            ))}
          </Tooltip>
        )}
      </div>
    </div>
  );
}

/** The same series as a table: one row per x, one column per series. */
export function LineTable({
  series,
  formatY,
  xTitle = "Lap",
}: {
  series: LineSeries[];
  formatY: (value: number) => string;
  xTitle?: string;
}) {
  const xs = [...new Set(series.flatMap((s) => s.points.map((p) => p.x)))].sort((a, b) => a - b);
  const valueAt = (s: LineSeries, x: number) => s.points.find((p) => p.x === x)?.y ?? null;
  return (
    <div className="max-h-[360px] overflow-auto">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 bg-[rgba(26,26,32,0.97)]">
          <tr>
            <th className="px-2 py-2 text-left text-[11px] font-medium uppercase tracking-[0.08em] text-white/50">
              {xTitle}
            </th>
            {series.map((s) => (
              <th
                key={s.key}
                className="px-2 py-2 text-right text-[11px] font-medium uppercase tracking-[0.08em] text-white/50"
              >
                <span className="inline-flex items-center gap-1.5">
                  <LineKey colour={s.colour} dashed={s.dashed} width={12} />
                  {s.label}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {xs.map((x) => (
            <tr key={x} className="border-t border-white/[0.06]">
              <td className="px-2 py-1.5 tabular-nums text-white/60">{x}</td>
              {series.map((s) => {
                const v = valueAt(s, x);
                return (
                  <td key={s.key} className="px-2 py-1.5 text-right tabular-nums">
                    {v == null ? <span className="text-white/35">—</span> : formatY(v)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
