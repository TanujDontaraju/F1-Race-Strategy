"use client";

import { ArrowRight } from "lucide-react";
import { useMemo } from "react";
import { Card, DriverName, EmptyState, StatTile, TABLE, TD, TD_NUM, TH, TH_NUM, TR } from "@/components/analysis/parts";
import { useCompareStyles } from "@/components/analysis/useRaceData";
import { LineKey } from "@/components/charts/common";
import TyreBadge from "@/components/telemetry/TyreBadge";
import { pitStopRows, PitStopRow, stintLengths } from "@/lib/telemetry/analysis";
import { useTelemetryStore } from "@/lib/telemetry/store";

const seconds = (v: number | null | undefined, digits = 1) => (v == null ? "—" : `${v.toFixed(digits)} s`);
const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);
const QUICKEST = 10;

/** Horizontal bars of the quickest stationary times, value at each bar's tip. */
function QuickestStops({ stops }: { stops: PitStopRow[] }) {
  const quickest = stops
    .filter((s) => s.stationary != null)
    .sort((a, b) => a.stationary! - b.stationary!)
    .slice(0, QUICKEST);
  const slowest = Math.max(...quickest.map((s) => s.stationary!));
  if (quickest.length === 0) return <EmptyState>F1 didn&apos;t publish stationary times for this race.</EmptyState>;
  return (
    <ol className="flex flex-col gap-1.5 px-1">
      {quickest.map((s, i) => (
        <li
          key={`${s.driver.driver_number}-${s.lap}`}
          className="grid grid-cols-[1.25rem_7.5rem_1fr] items-center gap-3 text-sm"
          title={`${s.driver.full_name}, lap ${s.lap}: ${s.stationary!.toFixed(1)} s stationary`}
        >
          <span className="text-right tabular-nums text-white/50">{i + 1}</span>
          <span className="flex items-center gap-2">
            <DriverName driver={s.driver} full={false} />
            <span className="text-xs text-white/45">L{s.lap}</span>
          </span>
          <span className="flex items-center gap-2">
            {/* Square at the baseline, rounded at the data end. */}
            <span
              className="h-3 rounded-r-[4px] bg-white/75"
              style={{ width: `${(s.stationary! / slowest) * 85}%` }}
            />
            <span className="text-xs font-semibold tabular-nums">{s.stationary!.toFixed(1)} s</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

export default function PitStops() {
  const timeline = useTelemetryStore((s) => s.timeline);
  const drivers = useTelemetryStore((s) => s.drivers);
  const pits = useTelemetryStore((s) => s.pits);
  const compare = useTelemetryStore((s) => s.compare);
  const styles = useCompareStyles();

  const { stops, compounds } = useMemo(() => {
    if (!timeline) return { stops: [], compounds: [] };
    return {
      stops: pitStopRows(timeline, drivers, pits).sort((a, b) => a.lap - b.lap),
      compounds: stintLengths(timeline, drivers).sort((a, b) => b.mean - a.mean),
    };
  }, [timeline, drivers, pits]);

  if (stops.length === 0) {
    return (
      <Card title="Pit stops">
        <EmptyState>No pit stops were recorded for this race.</EmptyState>
      </Card>
    );
  }

  const stationary = stops.map((s) => s.stationary).filter((v): v is number => v != null);
  const lane = stops.map((s) => s.lane).filter((v): v is number => v != null);
  const quickest = stops.reduce<PitStopRow | null>(
    (best, s) => (s.stationary != null && (!best || s.stationary < best.stationary!) ? s : best),
    null
  );

  return (
    <>
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Stops" value={stops.length} detail={`${new Set(stops.map((s) => s.driver.driver_number)).size} drivers`} />
        <StatTile
          label="Quickest stop"
          value={seconds(quickest?.stationary)}
          detail={quickest && `${quickest.driver.name_acronym} · lap ${quickest.lap}`}
        />
        <StatTile
          label="Average stop"
          value={seconds(mean(stationary))}
          detail={`Stationary · ${stationary.length} of ${stops.length} timed by F1`}
        />
        <StatTile label="Average pit lane" value={seconds(mean(lane))} detail="Entry to exit" />
      </dl>

      {styles.length > 0 && (
        <Card title="Compared drivers" subtitle="Stationary is time in the box; pit lane is entry to exit, which is what the stop costs">
          <div className="-mx-1 overflow-x-auto px-1">
            <table className={`${TABLE} min-w-[520px]`}>
              <thead>
                <tr>
                  <th className={TH}>Driver</th>
                  <th className={TH}>Laps</th>
                  <th className={TH_NUM}>Avg stationary</th>
                  <th className={TH_NUM}>Avg pit lane</th>
                  <th className={TH_NUM}>Total pit lane</th>
                </tr>
              </thead>
              <tbody>
                {styles.map(({ driver, colour, dashed }) => {
                  const own = stops.filter((s) => s.driver.driver_number === driver.driver_number);
                  const lanes = own.map((s) => s.lane).filter((v): v is number => v != null);
                  return (
                    <tr key={driver.driver_number} className={TR}>
                      <td className={TD}>
                        <span className="flex items-center gap-2 font-bold">
                          <LineKey colour={colour} dashed={dashed} width={12} />
                          {driver.name_acronym}
                        </span>
                      </td>
                      <td className={`${TD} tabular-nums text-white/70`}>
                        {own.length ? own.map((s) => s.lap).join(", ") : "No stops"}
                      </td>
                      <td className={TD_NUM}>
                        {seconds(mean(own.map((s) => s.stationary).filter((v): v is number => v != null)))}
                      </td>
                      <td className={TD_NUM}>{seconds(mean(lanes))}</td>
                      <td className={`${TD_NUM} font-semibold`}>{lanes.length ? seconds(lanes.reduce((a, b) => a + b, 0)) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div className="grid items-start gap-4 xl:grid-cols-2">
        <Card title="Quickest stops" subtitle="Seconds stationary in the box">
          <QuickestStops stops={stops} />
        </Card>

        <Card title="Stint length by compound" subtitle="Laps each set lasted, across the field">
          <table className={TABLE}>
            <thead>
              <tr>
                <th className={TH}>Compound</th>
                <th className={TH_NUM}>Stints</th>
                <th className={TH_NUM}>Average</th>
                <th className={TH_NUM}>Longest</th>
              </tr>
            </thead>
            <tbody>
              {compounds.map((c) => (
                <tr key={c.compound} className={TR}>
                  <td className={TD}>
                    <span className="flex items-center gap-2 capitalize">
                      <TyreBadge compound={c.compound} size={18} />
                      {c.compound.toLowerCase()}
                    </span>
                  </td>
                  <td className={`${TD_NUM} text-white/70`}>{c.stints}</td>
                  <td className={`${TD_NUM} font-semibold`}>{c.mean.toFixed(1)} laps</td>
                  <td className={`${TD_NUM} text-white/70`}>
                    {c.longest.laps} · {c.longest.driver.name_acronym}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <Card title="Every stop" subtitle="In the order they happened">
        <div className="-mx-1 max-h-[480px] overflow-auto px-1">
          <table className={`${TABLE} min-w-[520px]`}>
            <thead className="sticky top-0 bg-[rgba(30,30,36,0.98)]">
              <tr>
                <th className={`${TH_NUM} w-10`}>Lap</th>
                <th className={TH}>Driver</th>
                <th className={TH}>Tyres</th>
                <th className={TH_NUM}>Stationary</th>
                <th className={TH_NUM}>Pit lane</th>
              </tr>
            </thead>
            <tbody>
              {stops.map((s) => (
                <tr
                  key={`${s.driver.driver_number}-${s.lap}`}
                  className={`${TR} ${compare.includes(s.driver.driver_number) ? "bg-white/[0.04]" : ""}`}
                >
                  <td className={`${TD_NUM} text-white/60`}>{s.lap}</td>
                  <td className={TD}>
                    <DriverName driver={s.driver} />
                  </td>
                  <td className={TD}>
                    <span className="flex items-center gap-1.5">
                      <TyreBadge compound={s.from} size={18} />
                      <ArrowRight size={12} className="text-white/40" aria-label="to" />
                      <TyreBadge compound={s.to} size={18} />
                    </span>
                  </td>
                  <td className={TD_NUM}>{seconds(s.stationary)}</td>
                  <td className={`${TD_NUM} text-white/70`}>{seconds(s.lane)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
