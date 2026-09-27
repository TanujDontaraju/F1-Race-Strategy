"use client";

import { useMemo, useState } from "react";
import { Card, EmptyState, TABLE, TD, TD_NUM, TH, TH_NUM, TR } from "@/components/analysis/parts";
import { useCompareStyles, useRaceLaps } from "@/components/analysis/useRaceData";
import ChartCard from "@/components/charts/ChartCard";
import { LineKey } from "@/components/charts/common";
import Distribution, { spreadOf } from "@/components/charts/Distribution";
import LineChart, { LineTable } from "@/components/charts/LineChart";
import GlassPanel from "@/components/telemetry/GlassPanel";
import SegmentedControl from "@/components/telemetry/SegmentedControl";
import { isCleanLap, paceSummary } from "@/lib/telemetry/analysis";
import { formatLapTick, formatLapTime } from "@/lib/telemetry/format";

const LAP_FILTERS = ["Racing laps", "All laps"] as const;
type LapFilter = (typeof LAP_FILTERS)[number];

export default function Progression() {
  const styles = useCompareStyles();
  const { laps, bands } = useRaceLaps(styles);
  const [filter, setFilter] = useState<LapFilter>("Racing laps");

  const series = useMemo(
    () =>
      styles.map(({ driver, colour, dashed }) => ({
        key: driver.driver_number,
        label: driver.name_acronym,
        colour,
        dashed,
        points: (laps.get(driver.driver_number) ?? []).map((p) => ({
          x: p.lap,
          y: filter === "All laps" || isCleanLap(p) ? p.time : null,
        })),
      })),
    [styles, laps, filter]
  );
  const rows = useMemo(
    () =>
      styles.map(({ driver, colour, dashed }) => ({
        key: driver.driver_number,
        label: driver.name_acronym,
        colour,
        dashed,
        values: (laps.get(driver.driver_number) ?? [])
          .filter(isCleanLap)
          .map((p) => ({ value: p.time!, tag: `Lap ${p.lap}` })),
      })),
    [styles, laps]
  );

  if (styles.length === 0) {
    return (
      <Card title="Progression">
        <EmptyState>Pick drivers to compare from the menu at the top.</EmptyState>
      </Card>
    );
  }

  return (
    <>
      <ChartCard
        title="Lap times"
        subtitle={
          filter === "Racing laps"
            ? "Pit laps, the opening lap and laps behind the safety car are left out, so the scale shows race pace"
            : "Every timed lap, including pit stops and safety car laps"
        }
        controls={<SegmentedControl label="Laps shown" kind="radio" options={LAP_FILTERS} value={filter} onChange={setFilter} />}
        chart={
          <LineChart
            series={series}
            label="Lap times by lap"
            formatY={formatLapTime}
            formatTick={formatLapTick}
            bands={bands}
            height={320}
          />
        }
        table={<LineTable series={series} formatY={formatLapTime} />}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {styles.map(({ driver, colour, dashed }) => {
          const pace = paceSummary(laps.get(driver.driver_number) ?? []);
          return (
            <GlassPanel key={driver.driver_number} className="flex flex-col gap-3 p-4" aria-label={`${driver.full_name} pace`}>
              <p className="flex items-center gap-2 px-1">
                <LineKey colour={colour} dashed={dashed} />
                <span className="text-sm font-bold tracking-[0.04em]">{driver.name_acronym}</span>
                <span className="truncate text-sm text-white/55">{driver.last_name}</span>
              </p>
              <dl className="grid grid-cols-3 gap-2 px-1">
                {[
                  ["Best", formatLapTime(pace.best)],
                  ["Average", formatLapTime(pace.mean)],
                  ["Consistency", pace.sd == null ? "—" : `±${pace.sd.toFixed(2)} s`],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-white/50">{label}</dt>
                    <dd className="mt-0.5 text-[15px] font-bold">{value}</dd>
                  </div>
                ))}
              </dl>
              <p className="px-1 text-xs text-white/45">
                {pace.laps} racing laps · consistency is the standard deviation, lower is steadier
              </p>
            </GlassPanel>
          );
        })}
      </div>

      <ChartCard
        title="Lap time spread"
        subtitle="Racing laps only. The box holds the middle half of each driver's laps; the white tick is the median"
        chart={
          <Distribution
            rows={rows}
            format={formatLapTime}
            formatTick={formatLapTick}
            label="Distribution of racing lap times"
          />
        }
        table={
          <table className={TABLE}>
            <thead>
              <tr>
                <th className={TH}>Driver</th>
                <th className={TH_NUM}>Laps</th>
                <th className={TH_NUM}>Fastest</th>
                <th className={TH_NUM}>Q1</th>
                <th className={TH_NUM}>Median</th>
                <th className={TH_NUM}>Q3</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const spread = spreadOf(row.values.map((v) => v.value));
                return (
                  <tr key={row.key} className={TR}>
                    <td className={TD}>
                      <span className="flex items-center gap-2 font-bold">
                        <LineKey colour={row.colour} dashed={row.dashed} width={12} />
                        {row.label}
                      </span>
                    </td>
                    <td className={TD_NUM}>{row.values.length}</td>
                    <td className={TD_NUM}>{formatLapTime(spread && Math.min(...row.values.map((v) => v.value)))}</td>
                    <td className={TD_NUM}>{formatLapTime(spread?.q1)}</td>
                    <td className={`${TD_NUM} font-semibold`}>{formatLapTime(spread?.median)}</td>
                    <td className={TD_NUM}>{formatLapTime(spread?.q3)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        }
      />
    </>
  );
}
