"use client";

import { useMemo } from "react";
import { Card, DriverName, StatTile, TABLE, TD, TD_NUM, TH, TH_NUM, TR } from "@/components/analysis/parts";
import SessionInfo from "@/components/analysis/SessionInfo";
import TyreBadge from "@/components/telemetry/TyreBadge";
import { practiceRankings, sessionFacts } from "@/lib/telemetry/analysis";
import { formatLapTime } from "@/lib/telemetry/format";
import { useTelemetryStore } from "@/lib/telemetry/store";

export default function PracticeOverview() {
  const timeline = useTelemetryStore((s) => s.timeline);
  const drivers = useTelemetryStore((s) => s.drivers);

  const { rows, facts } = useMemo(() => {
    if (!timeline) return { rows: [], facts: null };
    return { rows: practiceRankings(timeline, drivers), facts: sessionFacts(timeline, drivers) };
  }, [timeline, drivers]);
  // Representative pace: the best average is the one to beat, so mark it like the fastest lap.
  const bestPace = Math.min(...rows.map((r) => r.representative ?? Infinity));
  const pacesetter = rows.find((r) => r.representative === bestPace);

  return (
    <>
      <SessionInfo />

      {facts && (
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile
            label="Fastest lap"
            value={formatLapTime(facts.fastestLap?.duration)}
            detail={facts.fastestLap?.driver.name_acronym}
          />
          <StatTile
            label="Top speed"
            value={facts.topSpeed ? `${facts.topSpeed.speed} km/h` : "—"}
            detail={facts.topSpeed && `${facts.topSpeed.driver.name_acronym} · speed trap`}
          />
          <StatTile
            label="Laps run"
            value={facts.totalLaps}
            detail={facts.mostLaps && `Most: ${facts.mostLaps.driver.name_acronym}, ${facts.mostLaps.laps}`}
          />
          <StatTile
            label="Best average pace"
            value={formatLapTime(pacesetter?.representative)}
            detail={pacesetter?.driver.name_acronym}
          />
        </dl>
      )}

      <Card
        title="Classification"
        subtitle="Average pace is the mean of each driver's laps within 107% of their best, which leaves out out-laps and cool-downs"
      >
        <div className="-mx-1 overflow-x-auto px-1">
          <table className={`${TABLE} min-w-[560px]`}>
            <thead>
              <tr>
                <th className={`${TH_NUM} w-8`}>Pos</th>
                <th className={TH}>Driver</th>
                <th className={`${TH} hidden md:table-cell`}>Team</th>
                <th className={TH}>Tyres</th>
                <th className={TH_NUM}>Best</th>
                <th className={TH_NUM}>Gap</th>
                <th className={TH_NUM}>Avg pace</th>
                <th className={TH_NUM}>Laps</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.driver.driver_number} className={TR}>
                  <td className={`${TD_NUM} font-medium text-white/60`}>{row.best == null ? "–" : i + 1}</td>
                  <td className={TD}>
                    <DriverName driver={row.driver} />
                  </td>
                  <td className={`${TD} hidden truncate text-white/55 md:table-cell`}>{row.driver.team_name}</td>
                  <td className={TD}>
                    <span className="flex items-center gap-1">
                      {row.compounds.map((compound, j) => (
                        <TyreBadge key={j} compound={compound} size={18} />
                      ))}
                    </span>
                  </td>
                  <td className={`${TD_NUM} font-semibold`}>{formatLapTime(row.best)}</td>
                  <td className={`${TD_NUM} text-white/60`}>
                    {row.gap == null ? "" : row.gap === 0 ? "—" : `+${row.gap.toFixed(3)}`}
                  </td>
                  <td className={`${TD_NUM} ${row.representative === bestPace ? "font-semibold" : "text-white/75"}`}>
                    {formatLapTime(row.representative)}
                  </td>
                  <td className={`${TD_NUM} text-white/60`}>{row.laps}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
