"use client";

import { useMemo } from "react";
import { Card, DriverName, EmptyState, TABLE, TD, TH, TR } from "@/components/analysis/parts";
import { useCompareStyles, useRaceLaps } from "@/components/analysis/useRaceData";
import ChartCard from "@/components/charts/ChartCard";
import LineChart, { LineSeries, LineTable } from "@/components/charts/LineChart";
import TyreTimeline, { TimelineRow } from "@/components/charts/TyreTimeline";
import TyreBadge from "@/components/telemetry/TyreBadge";
import { classification } from "@/lib/telemetry/analysis";
import { useTelemetryStore } from "@/lib/telemetry/store";

const formatPosition = (p: number) => `P${Math.round(p)}`;
const formatGap = (g: number) => (g === 0 ? "Leader" : `+${g.toFixed(1)} s`);
const formatGapTick = (g: number) => (g === 0 ? "Leader" : `+${g} s`);

export default function Strategy() {
  const styles = useCompareStyles();
  const { laps, bands } = useRaceLaps(styles);
  const timeline = useTelemetryStore((s) => s.timeline);
  const drivers = useTelemetryStore((s) => s.drivers);
  const replay = useTelemetryStore((s) => s.replay);
  const grid = useTelemetryStore((s) => s.grid);
  const retirements = useTelemetryStore((s) => s.retirements);
  const compare = useTelemetryStore((s) => s.compare);

  const { positions, gaps } = useMemo(() => {
    const gridOf = new Map(grid.map((g) => [g.driver_number, g.position]));
    const base = (s: (typeof styles)[number]) => ({
      key: s.driver.driver_number,
      label: s.driver.name_acronym,
      colour: s.colour,
      dashed: s.dashed,
    });
    const positions: LineSeries[] = styles.map((s) => {
      const start = gridOf.get(s.driver.driver_number);
      const points = (laps.get(s.driver.driver_number) ?? []).map((p) => ({ x: p.lap, y: p.position }));
      return { ...base(s), points: start != null ? [{ x: 0, y: start }, ...points] : points };
    });
    const gaps: LineSeries[] = styles.map((s) => ({
      ...base(s),
      points: (laps.get(s.driver.driver_number) ?? []).map((p) => ({ x: p.lap, y: p.gap })),
    }));
    return { positions, gaps };
  }, [styles, laps, grid]);

  const { rows, totalLaps } = useMemo(() => {
    if (!timeline || !replay) return { rows: [] as TimelineRow[], totalLaps: 0 };
    const retired = new Set(retirements.map((r) => r.driver_number));
    const rows = classification(timeline, drivers, replay.end).map((driver) => ({
      driver,
      stints: timeline.stints.get(driver.driver_number) ?? [],
      lastLap: (timeline.laps.get(driver.driver_number) ?? []).at(-1)?.lap ?? null,
      retired: retired.has(driver.driver_number),
      emphasised: compare.includes(driver.driver_number),
    }));
    return { rows, totalLaps: Math.max(0, ...rows.map((r) => r.lastLap ?? 0)) };
  }, [timeline, drivers, replay, retirements, compare]);

  const fieldSize = drivers.length || 20;
  const positionTicks = [1, 5, 10, 15, 20].filter((t) => t <= fieldSize);

  return (
    <>
      {styles.length === 0 ? (
        <Card title="Positions">
          <EmptyState>Pick drivers to compare from the menu at the top.</EmptyState>
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          <ChartCard
            title="Positions"
            subtitle="Place at the end of each lap, from the grid"
            chart={
              <LineChart
                series={positions}
                label="Race position by lap"
                formatY={formatPosition}
                formatX={(x) => (x === 0 ? "Grid" : `Lap ${x}`)}
                invertY
                yDomain={[1, fieldSize]}
                yTicks={positionTicks}
                step
                bands={bands}
              />
            }
            table={<LineTable series={positions} formatY={formatPosition} />}
          />
          <ChartCard
            title="Gap to leader"
            subtitle="Seconds behind the leader as each lap ends; lapped cars drop off"
            chart={
              <LineChart
                series={gaps}
                label="Gap to the leader by lap"
                formatY={formatGap}
                formatTick={formatGapTick}
                zeroBased
                bands={bands}
              />
            }
            table={<LineTable series={gaps} formatY={formatGap} />}
          />
        </div>
      )}

      <ChartCard
        title="Tyre strategy"
        subtitle="Every driver's stints in finishing order; the drivers you're comparing are highlighted"
        chart={<TyreTimeline rows={rows} laps={totalLaps} label="Tyre stints for every driver" />}
        table={
          <table className={TABLE}>
            <thead>
              <tr>
                <th className={TH}>Driver</th>
                <th className={TH}>Stints</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.driver.driver_number} className={TR}>
                  <td className={TD}>
                    <DriverName driver={row.driver} />
                  </td>
                  <td className={TD}>
                    <span className="flex flex-wrap items-center gap-x-4 gap-y-1 tabular-nums">
                      {row.stints.map((s) => (
                        <span key={s.stint_number} className="flex items-center gap-1.5 text-white/75">
                          <TyreBadge compound={s.compound} size={18} />
                          {s.lap_start}–{s.lap_end ?? row.lastLap}
                        </span>
                      ))}
                      {row.retired && <span className="text-white/45">DNF</span>}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        }
      />
    </>
  );
}
