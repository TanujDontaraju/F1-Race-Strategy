"use client";

import { scaleLinear } from "d3-scale";
import { useMemo, useState } from "react";
import { AXIS_TEXT, GRID, Legend, SwatchKey, TICK_FONT, Tooltip, useElementWidth } from "@/components/charts/common";
import { COMPOUND_ORDER, tyreColour, tyreLabel } from "@/components/telemetry/TyreBadge";
import { Driver, StintRow } from "@/lib/telemetry/types";

export interface TimelineRow {
  driver: Driver;
  stints: StintRow[];
  /** Last lap they ran, for stints still open at the end. */
  lastLap: number | null;
  retired: boolean;
  emphasised: boolean;
}

const ROW = 22;
const BAR_H = 12;
const LABEL_W = 44;
const RIGHT = 36;
const AXIS_H = 24;
// The surface showing between stints, like the gap between stacked segments.
const GAP = 2;

interface Segment {
  row: number;
  stint: StintRow;
  from: number;
  to: number;
}

/** Every driver's stints across the race, coloured by compound; the compared drivers stay bright. */
export default function TyreTimeline({ rows, laps, label }: { rows: TimelineRow[]; laps: number; label: string }) {
  const [containerRef, width] = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<Segment | null>(null);
  const plotW = Math.max(0, width - LABEL_W - RIGHT);
  const height = rows.length * ROW + AXIS_H;
  // Each lap is a slot from lap - 1 to lap, so lap 1 starts at the origin.
  const x = useMemo(() => scaleLinear().domain([0, laps]).range([0, plotW]), [laps, plotW]);

  const segments = useMemo(
    () =>
      rows.flatMap((row, r) =>
        row.stints.map((stint) => ({
          row: r,
          stint,
          from: stint.lap_start - 1,
          to: stint.lap_end ?? row.lastLap ?? stint.lap_start,
        }))
      ),
    [rows]
  );
  const compounds = COMPOUND_ORDER.filter((c) => segments.some((s) => s.stint.compound === c));
  const anyEmphasised = rows.some((r) => r.emphasised);

  return (
    <div className="flex flex-col gap-3">
      <Legend items={compounds.map((c) => ({ key: c, label: tyreLabel(c), swatch: <SwatchKey colour={tyreColour(c)} /> }))} />
      <div ref={containerRef} className="relative" style={{ height }}>
        {width > 0 && (
          <svg width={width} height={height} role="img" aria-label={label}>
            <g transform={`translate(${LABEL_W},0)`}>
              {x.ticks(Math.max(2, Math.floor(plotW / 90))).filter(Number.isInteger).map((t) => (
                <g key={t} transform={`translate(${x(t)},0)`}>
                  <line y2={rows.length * ROW} stroke={GRID} />
                  <text y={rows.length * ROW + 16} textAnchor="middle" fill={AXIS_TEXT} style={TICK_FONT}>
                    {t}
                  </text>
                </g>
              ))}
            </g>

            {rows.map((row, r) => {
              const dim = anyEmphasised && !row.emphasised;
              const cy = r * ROW + ROW / 2;
              const end = segments.filter((s) => s.row === r).at(-1)?.to;
              return (
                <g key={row.driver.driver_number} opacity={dim ? 0.35 : 1}>
                  <text x={0} y={cy} dy="0.32em" fill="white" fillOpacity={dim ? 0.7 : 0.9} fontSize={11} fontWeight={700}>
                    {row.driver.name_acronym}
                  </text>
                  {row.retired && end != null && (
                    <text x={LABEL_W + x(end) + 6} y={cy} dy="0.32em" fill={AXIS_TEXT} fontSize={10} fontWeight={600}>
                      DNF
                    </text>
                  )}
                </g>
              );
            })}

            <g transform={`translate(${LABEL_W},0)`}>
              {segments.map((s) => {
                const row = rows[s.row];
                const dim = anyEmphasised && !row.emphasised;
                const isHovered = hover === s;
                return (
                  <rect
                    key={`${row.driver.driver_number}-${s.stint.stint_number}`}
                    x={x(s.from) + GAP / 2}
                    width={Math.max(1, x(s.to) - x(s.from) - GAP)}
                    y={s.row * ROW + (ROW - BAR_H) / 2}
                    height={BAR_H}
                    rx={4}
                    fill={tyreColour(s.stint.compound)}
                    fillOpacity={isHovered ? 1 : dim ? 0.3 : 0.85}
                    onPointerEnter={() => setHover(s)}
                    onPointerLeave={() => setHover(null)}
                  />
                );
              })}
            </g>
          </svg>
        )}
        {hover && (
          <Tooltip x={LABEL_W + x((hover.from + hover.to) / 2)} y={hover.row * ROW + ROW + 2} width={width}>
            <p className="flex items-center gap-2 font-semibold text-white">
              <SwatchKey colour={tyreColour(hover.stint.compound)} />
              {tyreLabel(hover.stint.compound)}
              <span className="font-normal text-white/55">{rows[hover.row].driver.name_acronym}</span>
            </p>
            <p className="mt-1 tabular-nums text-white/70">
              Laps {hover.from + 1}–{hover.to} · {hover.to - hover.from} {hover.to - hover.from === 1 ? "lap" : "laps"}
            </p>
            {hover.stint.tyre_age_at_start ? (
              <p className="tabular-nums text-white/55">{hover.stint.tyre_age_at_start} laps old at the start</p>
            ) : (
              <p className="text-white/55">New set</p>
            )}
          </Tooltip>
        )}
      </div>
    </div>
  );
}
