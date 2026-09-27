"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { useMemo } from "react";
import { Card, DriverName, StatTile, TABLE, TD, TD_NUM, TH, TH_NUM, TR } from "@/components/analysis/parts";
import SessionInfo from "@/components/analysis/SessionInfo";
import TyreBadge from "@/components/telemetry/TyreBadge";
import { raceResults, raceStats, RaceResultRow } from "@/lib/telemetry/analysis";
import { formatGap, formatLapTime, formatRaceTime } from "@/lib/telemetry/format";
import { useTelemetryStore } from "@/lib/telemetry/store";

function Gained({ places }: { places: number | null }) {
  if (places == null) return <span className="text-white/35">—</span>;
  if (places === 0) return <span className="text-white/45">0</span>;
  const up = places > 0;
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <span
      className={`inline-flex items-center justify-end gap-0.5 font-semibold ${up ? "text-emerald-400" : "text-rose-400"}`}
      aria-label={`${up ? "Gained" : "Lost"} ${Math.abs(places)}`}
    >
      <Icon size={12} strokeWidth={2.5} aria-hidden />
      {Math.abs(places)}
    </span>
  );
}

function Gap({ row, winnerTime }: { row: RaceResultRow; winnerTime: number | null }) {
  if (row.retiredOnLap != null) {
    return (
      <span className="text-white/45">
        DNF <span className="text-[11px]">· L{row.retiredOnLap}</span>
      </span>
    );
  }
  if (row.position === 1) return <span className="font-semibold">{formatRaceTime(winnerTime)}</span>;
  return <span className="text-white/75">{formatGap(row.gap)}</span>;
}

export default function RaceOverview() {
  const timeline = useTelemetryStore((s) => s.timeline);
  const drivers = useTelemetryStore((s) => s.drivers);
  const replay = useTelemetryStore((s) => s.replay);
  const grid = useTelemetryStore((s) => s.grid);
  const pits = useTelemetryStore((s) => s.pits);
  const retirements = useTelemetryStore((s) => s.retirements);
  const trackStatus = useTelemetryStore((s) => s.trackStatus);

  const { results, stats } = useMemo(() => {
    if (!timeline || !replay) return { results: [], stats: null };
    return {
      results: raceResults(timeline, drivers, grid, retirements, pits, replay.end),
      stats: raceStats(timeline, drivers, trackStatus, pits, retirements, replay.end),
    };
  }, [timeline, drivers, replay, grid, pits, retirements, trackStatus]);

  return (
    <>
      <SessionInfo laps={stats?.laps} />

      {stats && (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <StatTile
            label="Fastest lap"
            value={formatLapTime(stats.fastestLap?.duration)}
            detail={stats.fastestLap && `${stats.fastestLap.driver.name_acronym} · lap ${stats.fastestLap.lap}`}
          />
          <StatTile label="Race time" value={formatRaceTime(stats.winnerTime)} detail={`${stats.laps} laps`} />
          <StatTile
            label="Pit stops"
            value={stats.pitStops}
            detail={
              stats.quickestStop &&
              `Quickest ${stats.quickestStop.duration.toFixed(1)} s · ${stats.quickestStop.driver.name_acronym}`
            }
          />
          <StatTile label="Overtakes" value={stats.overtakes} detail="On track, lap to lap" />
          <StatTile
            label="Retirements"
            value={stats.retirements}
            detail={`${stats.retirements === 0 ? "Everyone" : results.length - stats.retirements} finished`}
          />
          <StatTile
            label="Safety car"
            value={`${stats.safetyCarLaps} ${stats.safetyCarLaps === 1 ? "lap" : "laps"}`}
            detail={`VSC ${stats.vscLaps} ${stats.vscLaps === 1 ? "lap" : "laps"}`}
          />
        </dl>
      )}

      <Card title="Classification" subtitle="Gap to the winner, grid slot and places gained, and the tyres each driver used">
        <div className="-mx-1 overflow-x-auto px-1">
          <table className={`${TABLE} min-w-[560px]`}>
            <thead>
              <tr>
                <th className={`${TH_NUM} w-8`}>Pos</th>
                <th className={TH}>Driver</th>
                <th className={`${TH} hidden md:table-cell`}>Team</th>
                <th className={TH}>Tyres</th>
                <th className={TH_NUM}>Gap</th>
                <th className={TH_NUM}>Grid</th>
                <th className={TH_NUM}>+/−</th>
                <th className={TH_NUM}>Stops</th>
              </tr>
            </thead>
            <tbody>
              {results.map((row) => (
                <tr key={row.driver.driver_number} className={TR}>
                  <td className={`${TD_NUM} font-medium text-white/60`}>{row.position ?? "–"}</td>
                  <td className={TD}>
                    <DriverName driver={row.driver} />
                  </td>
                  <td className={`${TD} hidden truncate text-white/55 md:table-cell`}>{row.driver.team_name}</td>
                  <td className={TD}>
                    <span className="flex items-center gap-1">
                      {row.compounds.map((compound, i) => (
                        <TyreBadge key={i} compound={compound} size={18} />
                      ))}
                    </span>
                  </td>
                  <td className={TD_NUM}>
                    <Gap row={row} winnerTime={stats?.winnerTime ?? null} />
                  </td>
                  <td className={`${TD_NUM} text-white/60`}>{row.grid ?? "—"}</td>
                  <td className={TD_NUM}>
                    <Gained places={row.retiredOnLap == null ? row.gained : null} />
                  </td>
                  <td className={`${TD_NUM} text-white/60`}>{row.pitStops}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
