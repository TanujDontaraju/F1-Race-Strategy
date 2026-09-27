"use client";

import { scaleLinear } from "d3-scale";
import { curveStepAfter, line } from "d3-shape";
import { PointerEvent, useMemo, useState } from "react";
import { AXIS_TEXT, GRID, Legend, LineKey, SURFACE, TICK_FONT, Tooltip, useElementWidth } from "@/components/charts/common";
import { QualifyingLap, QualifyingTimeline } from "@/lib/telemetry/analysis";
import { formatLapTick, formatLapTime } from "@/lib/telemetry/format";
import { SeriesStyle } from "@/lib/telemetry/seriesColours";

const MARGIN = { top: 22, right: 30, bottom: 30, left: 56 };
const HEIGHT = 340;
const CUTOFF = "#ff6961";
const OTHERS = "rgba(255,255,255,0.28)";
// The pointer picks the nearest lap within this radius.
const HIT_RADIUS = 24;

/** A dot key: filled for a driver's own colour, hollow for the second driver of a team. */
function DotKey({ colour, hollow = false }: { colour: string; hollow?: boolean }) {
  return (
    <svg width={10} height={10} aria-hidden className="shrink-0">
      <circle cx={5} cy={5} r={3.5} fill={hollow ? SURFACE : colour} stroke={colour} strokeWidth={hollow ? 2 : 0} />
    </svg>
  );
}

/**
 * Every flying lap across the session against when it was set, with the time
 * needed to get through each part as a step line that tightens as laps come in.
 */
export default function QualifyingTimelineChart({
  data,
  styles,
  prefix,
}: {
  data: QualifyingTimeline;
  styles: SeriesStyle[];
  prefix: string;
}) {
  const [containerRef, width] = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<QualifyingLap | null>(null);
  const plotW = Math.max(0, width - MARGIN.left - MARGIN.right);
  const plotH = HEIGHT - MARGIN.top - MARGIN.bottom;
  const styleOf = useMemo(() => new Map(styles.map((s) => [s.driver.driver_number, s])), [styles]);
  const sessionStart = data.parts[0]?.start ?? 0;

  const { x, y } = useMemo(() => {
    const times = data.laps.map((l) => l.time);
    return {
      // Minutes into the session, so the ticks land on round numbers.
      x: scaleLinear()
        .domain([0, ((data.parts.at(-1)?.end ?? sessionStart) - sessionStart) / 60000 || 1])
        .range([0, plotW]),
      y: scaleLinear()
        .domain([Math.min(...times), Math.max(...times)])
        .range([plotH, 0])
        .nice(5),
    };
  }, [data, sessionStart, plotW, plotH]);

  // Other drivers first, so the compared ones sit on top.
  const ordered = useMemo(
    () =>
      [...data.laps].sort(
        (a, b) => Number(styleOf.has(a.driver.driver_number)) - Number(styleOf.has(b.driver.driver_number))
      ),
    [data.laps, styleOf]
  );

  const minutes = (t: number) => Math.round((t - sessionStart) / 60000);
  const at = (t: number) => x((t - sessionStart) / 60000);

  const onPointerMove = (e: PointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    let best: QualifyingLap | null = null;
    let bestDistance = HIT_RADIUS;
    for (const lap of data.laps) {
      const d = Math.hypot(at(lap.t) - px, y(lap.time) - py);
      if (d < bestDistance) {
        best = lap;
        bestDistance = d;
      }
    }
    setHover(best);
  };

  const cutoffPath = line<{ t: number; time: number }>()
    .x((p) => at(p.t))
    .y((p) => y(p.time))
    .curve(curveStepAfter);
  const cutoffAt = (lap: QualifyingLap) => {
    const points = data.cutoffs.find((c) => c.part === lap.part)?.points ?? [];
    return points.findLast((p) => p.t < lap.t)?.time ?? null;
  };
  const hoverCutoff = hover ? cutoffAt(hover) : null;

  return (
    <div className="flex flex-col gap-3">
      <Legend
        items={[
          ...styles.map((s) => ({
            key: s.driver.driver_number,
            label: s.driver.name_acronym,
            swatch: <DotKey colour={s.colour} hollow={s.dashed} />,
          })),
          { key: "others", label: "Other drivers", swatch: <DotKey colour={OTHERS} /> },
          { key: "cutoff", label: "Time needed to go through", swatch: <LineKey colour={CUTOFF} /> },
        ]}
      />
      <div ref={containerRef} className="relative" style={{ height: HEIGHT }}>
        {width > 0 && (
          <svg width={width} height={HEIGHT} role="img" aria-label="Qualifying laps over time, with the knockout cutoff">
            <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
              {y.ticks(5).map((t) => (
                <g key={t} transform={`translate(0,${y(t)})`}>
                  <line x2={plotW} stroke={GRID} />
                  <text x={-10} dy="0.32em" textAnchor="end" fill={AXIS_TEXT} style={TICK_FONT}>
                    {formatLapTick(t)}
                  </text>
                </g>
              ))}
              <line y1={plotH} y2={plotH} x2={plotW} stroke={GRID} />
              {x.ticks(Math.max(2, Math.floor(plotW / 80))).map((t) => (
                <text key={t} x={x(t)} y={plotH + 18} textAnchor="middle" fill={AXIS_TEXT} style={TICK_FONT}>
                  {t}
                </text>
              ))}
              <text x={plotW} y={plotH + 18} dx={4} fill={AXIS_TEXT} fontSize={10}>
                min
              </text>

              {data.parts.map((part) => (
                <g key={part.number}>
                  <line x1={at(part.start)} x2={at(part.start)} y1={-14} y2={plotH} stroke="rgba(255,255,255,0.18)" />
                  <text x={at(part.start) + 6} y={-6} fill="rgba(255,255,255,0.7)" fontSize={11} fontWeight={700}>
                    {prefix}
                    {part.number}
                  </text>
                </g>
              ))}

              {data.cutoffs.map((c) => (
                <path key={c.part} d={cutoffPath(c.points) ?? undefined} fill="none" stroke={CUTOFF} strokeWidth={1.5} />
              ))}

              {ordered.map((lap, i) => {
                const style = styleOf.get(lap.driver.driver_number);
                const isHovered = hover === lap;
                if (!style) {
                  return <circle key={i} cx={at(lap.t)} cy={y(lap.time)} r={isHovered ? 4 : 2.5} fill={OTHERS} />;
                }
                return (
                  <circle
                    key={i}
                    cx={at(lap.t)}
                    cy={y(lap.time)}
                    r={isHovered ? 5.5 : 4}
                    fill={style.dashed ? SURFACE : style.colour}
                    stroke={style.dashed ? style.colour : SURFACE}
                    strokeWidth={2}
                  />
                );
              })}

              <rect
                width={plotW}
                height={plotH}
                fill="transparent"
                onPointerMove={onPointerMove}
                onPointerLeave={() => setHover(null)}
              />
            </g>
          </svg>
        )}
        {hover && (
          <Tooltip x={MARGIN.left + at(hover.t)} y={MARGIN.top + y(hover.time) + 10} width={width}>
            <p className="flex items-center gap-2 font-semibold text-white">
              <DotKey
                colour={styleOf.get(hover.driver.driver_number)?.colour ?? OTHERS}
                hollow={styleOf.get(hover.driver.driver_number)?.dashed}
              />
              {formatLapTime(hover.time)}
              <span className="font-normal text-white/55">{hover.driver.name_acronym}</span>
            </p>
            <p className="mt-1 text-white/55">
              {prefix}
              {hover.part} · {minutes(hover.t)} min in
              {hoverCutoff != null &&
                ` · ${hover.time <= hoverCutoff ? "inside" : "outside"} the cut by ${Math.abs(hover.time - hoverCutoff).toFixed(3)}`}
            </p>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
