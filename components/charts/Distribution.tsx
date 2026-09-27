"use client";

import { scaleLinear } from "d3-scale";
import { PointerEvent, useMemo, useState } from "react";
import { AXIS_TEXT, GRID, LineKey, SURFACE, TICK_FONT, Tooltip, useElementWidth } from "@/components/charts/common";

export interface DistributionRow {
  key: number | string;
  label: string;
  colour: string;
  dashed?: boolean;
  values: { value: number; tag: string }[];
}

export interface Spread {
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
}

const ROW = 44;
const LABEL_W = 60;
const AXIS_H = 26;
const RIGHT = 16;
const BOX_H = 16;

function quantile(sorted: number[], q: number): number {
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  return sorted[lo] + (sorted[Math.ceil(i)] - sorted[lo]) * (i - lo);
}

/** Five-number summary; the whiskers stop at the last value within 1.5 IQR of the box. */
export function spreadOf(values: number[]): Spread | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const q1 = quantile(sorted, 0.25);
  const q3 = quantile(sorted, 0.75);
  const reach = (q3 - q1) * 1.5;
  return {
    min: sorted.find((v) => v >= q1 - reach) ?? sorted[0],
    q1,
    median: quantile(sorted, 0.5),
    q3,
    max: sorted.findLast((v) => v <= q3 + reach) ?? sorted.at(-1)!,
  };
}

// A fixed scatter within the row, so the dots don't jump between renders.
const jitter = (i: number) => (((i * 2654435761) % 1000) / 1000 - 0.5) * (BOX_H + 6);

/** One row per driver: every value as a faint dot, with the middle half boxed and the median marked. */
export default function Distribution({
  rows,
  format,
  formatTick = format,
  label,
}: {
  rows: DistributionRow[];
  format: (value: number) => string;
  formatTick?: (value: number) => string;
  label: string;
}) {
  const [containerRef, width] = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<{ row: number; index: number } | null>(null);
  const height = rows.length * ROW + AXIS_H;
  const plotW = Math.max(0, width - LABEL_W - RIGHT);

  const spreads = useMemo(() => rows.map((r) => spreadOf(r.values.map((v) => v.value))), [rows]);
  const x = useMemo(() => {
    const all = rows.flatMap((r) => r.values.map((v) => v.value));
    return scaleLinear()
      .domain(all.length ? [Math.min(...all), Math.max(...all)] : [0, 1])
      .range([0, plotW])
      .nice(6);
  }, [rows, plotW]);

  const onPointerMove = (e: PointerEvent<SVGRectElement>, row: number) => {
    const px = e.clientX - e.currentTarget.getBoundingClientRect().left;
    const values = rows[row].values;
    let index = 0;
    values.forEach((v, i) => {
      if (Math.abs(x(v.value) - px) < Math.abs(x(values[index].value) - px)) index = i;
    });
    setHover({ row, index });
  };

  const hovered = hover && rows[hover.row].values[hover.index];

  return (
    <div ref={containerRef} className="relative" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={label}>
          <g transform={`translate(${LABEL_W},0)`}>
            {x.ticks(6).map((t) => (
              <g key={t} transform={`translate(${x(t)},0)`}>
                <line y2={rows.length * ROW} stroke={GRID} />
                <text y={rows.length * ROW + 17} textAnchor="middle" fill={AXIS_TEXT} style={TICK_FONT}>
                  {formatTick(t)}
                </text>
              </g>
            ))}
          </g>

          {rows.map((row, r) => {
            const s = spreads[r];
            const cy = r * ROW + ROW / 2;
            return (
              <g key={row.key}>
                <text x={0} y={cy} dy="0.32em" fill="rgba(255,255,255,0.8)" fontSize={12} fontWeight={700}>
                  {row.label}
                </text>
                <g transform={`translate(${LABEL_W},0)`}>
                  {row.values.map((v, i) => (
                    <circle
                      key={i}
                      cx={x(v.value)}
                      cy={cy + jitter(i)}
                      r={hover?.row === r && hover.index === i ? 4 : 2.5}
                      fill={row.colour}
                      fillOpacity={hover?.row === r && hover.index === i ? 1 : 0.45}
                      stroke={hover?.row === r && hover.index === i ? SURFACE : "none"}
                      strokeWidth={2}
                    />
                  ))}
                  {s && (
                    <g pointerEvents="none">
                      <line x1={x(s.min)} x2={x(s.q1)} y1={cy} y2={cy} stroke={row.colour} strokeOpacity={0.7} />
                      <line x1={x(s.q3)} x2={x(s.max)} y1={cy} y2={cy} stroke={row.colour} strokeOpacity={0.7} />
                      <rect
                        x={x(s.q1)}
                        width={Math.max(2, x(s.q3) - x(s.q1))}
                        y={cy - BOX_H / 2}
                        height={BOX_H}
                        rx={4}
                        fill={row.colour}
                        fillOpacity={0.14}
                        stroke={row.colour}
                        strokeWidth={1.5}
                        strokeDasharray={row.dashed ? "4 3" : undefined}
                      />
                      <line
                        x1={x(s.median)}
                        x2={x(s.median)}
                        y1={cy - BOX_H / 2}
                        y2={cy + BOX_H / 2}
                        stroke="white"
                        strokeWidth={2}
                      />
                    </g>
                  )}
                  <rect
                    y={r * ROW}
                    width={plotW}
                    height={ROW}
                    fill="transparent"
                    onPointerMove={(e) => onPointerMove(e, r)}
                    onPointerLeave={() => setHover(null)}
                  />
                </g>
              </g>
            );
          })}
        </svg>
      )}
      {hover && hovered && spreads[hover.row] && (
        <Tooltip x={LABEL_W + x(hovered.value)} y={hover.row * ROW + ROW - 4} width={width}>
          <p className="flex items-center gap-2 font-semibold text-white">
            <LineKey colour={rows[hover.row].colour} dashed={rows[hover.row].dashed} width={12} />
            {format(hovered.value)} <span className="font-normal text-white/55">{hovered.tag}</span>
          </p>
          <p className="mt-1 text-white/55">
            {rows[hover.row].label} median {format(spreads[hover.row]!.median)}
          </p>
        </Tooltip>
      )}
    </div>
  );
}
