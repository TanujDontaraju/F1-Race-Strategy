"use client";

import { useMemo } from "react";
import { Card, EmptyState, TABLE, TD, TD_NUM, TH, TH_NUM, TR } from "@/components/analysis/parts";
import { useCompareStyles } from "@/components/analysis/useRaceData";
import ChartCard from "@/components/charts/ChartCard";
import { LineKey } from "@/components/charts/common";
import Distribution, { spreadOf } from "@/components/charts/Distribution";
import { teamSectorLeaders } from "@/lib/telemetry/analysis";
import { formatLapTick, formatLapTime, teamColour } from "@/lib/telemetry/format";
import { useTelemetryStore } from "@/lib/telemetry/store";

// Laps slower than this share of a driver's best are out-laps, cool-downs or traffic.
const REPRESENTATIVE = 1.07;

function Best({ time, isBest, who }: { time: number | null; isBest: boolean; who?: string }) {
  if (time == null) return <span className="text-white/35">—</span>;
  return (
    <>
      <span className={isBest ? "rounded-md bg-violet-500/25 px-1.5 py-0.5 font-semibold text-violet-100" : "font-medium"}>
        {formatLapTime(time)}
      </span>
      {who && <span className="block text-[11px] text-white/45">{who}</span>}
    </>
  );
}

export default function PracticeAnalysis() {
  const timeline = useTelemetryStore((s) => s.timeline);
  const drivers = useTelemetryStore((s) => s.drivers);
  const styles = useCompareStyles();

  const teams = useMemo(() => (timeline ? teamSectorLeaders(timeline, drivers) : []), [timeline, drivers]);
  const rows = useMemo(() => {
    if (!timeline) return [];
    return styles.map(({ driver, colour, dashed }) => {
      const laps = (timeline.laps.get(driver.driver_number) ?? []).filter((l) => l.duration != null && !l.isPitOut);
      const best = Math.min(...laps.map((l) => l.duration!));
      return {
        key: driver.driver_number,
        label: driver.name_acronym,
        colour,
        dashed,
        values: laps
          .filter((l) => l.duration! <= best * REPRESENTATIVE)
          .map((l) => ({ value: l.duration!, tag: `Lap ${l.lap}` })),
      };
    });
  }, [timeline, styles]);

  // Quickest in each column across the teams.
  const columnBest = [0, 1, 2].map((i) => Math.min(...teams.map((t) => t.sectors[i]?.time ?? Infinity)));
  const bestIdeal = Math.min(...teams.map((t) => t.ideal ?? Infinity));
  const bestLap = Math.min(...teams.map((t) => t.best?.time ?? Infinity));

  return (
    <>
      <Card
        title="Team sector leaders"
        subtitle="Each team's best sectors from either car; the ideal lap adds them together. The quickest in each column is highlighted"
      >
        {teams.length === 0 ? (
          <EmptyState>No timed laps yet.</EmptyState>
        ) : (
          <div className="-mx-1 overflow-x-auto px-1">
            <table className={`${TABLE} min-w-[620px]`}>
              <thead>
                <tr>
                  <th className={TH}>Team</th>
                  <th className={TH_NUM}>S1</th>
                  <th className={TH_NUM}>S2</th>
                  <th className={TH_NUM}>S3</th>
                  <th className={TH_NUM}>Ideal lap</th>
                  <th className={TH_NUM}>Best lap</th>
                </tr>
              </thead>
              <tbody>
                {teams.map((t) => (
                  <tr key={t.team} className={TR}>
                    <td className={TD}>
                      <span className="flex items-center gap-2.5">
                        <span className="h-4 w-[3px] rounded-full" style={{ background: teamColour(t.drivers[0]) }} aria-hidden />
                        <span className="font-semibold">{t.team}</span>
                      </span>
                    </td>
                    {t.sectors.map((s, i) => (
                      <td key={i} className={TD_NUM}>
                        <Best time={s?.time ?? null} isBest={s?.time === columnBest[i]} who={s?.driver.name_acronym} />
                      </td>
                    ))}
                    <td className={TD_NUM}>
                      <Best time={t.ideal} isBest={t.ideal === bestIdeal} />
                    </td>
                    <td className={TD_NUM}>
                      <Best time={t.best?.time ?? null} isBest={t.best?.time === bestLap} who={t.best?.driver.name_acronym} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {styles.length > 0 && (
        <ChartCard
          title="Lap time spread"
          subtitle="Laps within 107% of each driver's best. A tight box means consistent running; a wide one mixes short and long runs"
          chart={<Distribution rows={rows} format={formatLapTime} formatTick={formatLapTick} label="Distribution of lap times" />}
          table={
            <table className={TABLE}>
              <thead>
                <tr>
                  <th className={TH}>Driver</th>
                  <th className={TH_NUM}>Laps</th>
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
      )}
    </>
  );
}
