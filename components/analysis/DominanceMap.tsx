"use client";

import { useMemo } from "react";
import { toPath, useOutline } from "@/components/analysis/CircuitOutline";
import { Legend, LineKey } from "@/components/charts/common";
import { Point, TrackGeometry } from "@/lib/telemetry/geometry";
import { MINI_SECTORS } from "@/lib/telemetry/lapAnalysis";
import { DASH, SeriesStyle } from "@/lib/telemetry/seriesColours";

/**
 * The circuit cut into equal mini-sectors, each drawn in the colour of whoever
 * was quickest through it. `winners[s]` indexes into `styles`.
 */
export default function DominanceMap({
  track,
  styles,
  winners,
}: {
  track: TrackGeometry;
  styles: SeriesStyle[];
  winners: number[];
}) {
  const { points, viewBox, unit } = useOutline(track);

  // Split the closed outline at equal shares of its length, interpolating the cut points.
  const segments = useMemo(() => {
    const loop = [...points, points[0]];
    const travelled = [0];
    for (let i = 1; i < loop.length; i++) {
      travelled.push(travelled[i - 1] + Math.hypot(loop[i].x - loop[i - 1].x, loop[i].y - loop[i - 1].y));
    }
    const total = travelled.at(-1)!;
    const pointAt = (d: number): Point => {
      const i = Math.max(0, travelled.findIndex((t) => t >= d) - 1);
      const span = travelled[i + 1] - travelled[i] || 1;
      const k = (d - travelled[i]) / span;
      return { x: loop[i].x + (loop[i + 1].x - loop[i].x) * k, y: loop[i].y + (loop[i + 1].y - loop[i].y) * k };
    };
    return Array.from({ length: MINI_SECTORS }, (_, s) => {
      const from = (s / MINI_SECTORS) * total;
      const to = ((s + 1) / MINI_SECTORS) * total;
      const inner = loop.filter((_, i) => travelled[i] > from && travelled[i] < to);
      return [pointAt(from), ...inner, pointAt(to)];
    });
  }, [points]);

  const counts = styles.map((_, i) => winners.filter((w) => w === i).length);

  return (
    <div className="flex flex-col gap-3">
      <Legend
        items={styles.map((s, i) => ({
          key: s.driver.driver_number,
          label: `${s.driver.name_acronym} · ${counts[i]}`,
          swatch: <LineKey colour={s.colour} dashed={s.dashed} />,
        }))}
      />
      <svg viewBox={viewBox} className="mx-auto max-h-[420px] w-full" role="img" aria-label="Track dominance map">
        {/* A dark casing keeps each coloured stretch crisp against the glass. */}
        <path
          d={toPath(points, true)}
          fill="none"
          stroke="rgba(0,0,0,0.55)"
          strokeWidth={12}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {segments.map((segment, s) => {
          const style = styles[winners[s]];
          if (!style) return null;
          return (
            <path
              key={s}
              d={toPath(segment)}
              fill="none"
              stroke={style.colour}
              strokeWidth={7}
              strokeLinecap="butt"
              strokeLinejoin="round"
              strokeDasharray={style.dashed ? DASH : undefined}
              vectorEffect="non-scaling-stroke"
            >
              <title>{`Mini-sector ${s + 1}: ${style.driver.name_acronym}`}</title>
            </path>
          );
        })}
        {points[0] && <circle cx={points[0].x} cy={points[0].y} r={unit * 1.6} fill="white" />}
      </svg>
      <p className="px-1 text-center text-xs text-white/45">
        {MINI_SECTORS} equal mini-sectors; the white dot is the start line. The number beside each driver is how many they
        won.
      </p>
    </div>
  );
}
