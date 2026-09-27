"use client";

import { useMemo } from "react";
import { Card, DriverName, EmptyState, TABLE, TD, TD_NUM, TH, TH_NUM, TR } from "@/components/analysis/parts";
import { useCompareStyles } from "@/components/analysis/useRaceData";
import ChartCard from "@/components/charts/ChartCard";
import QualifyingTimelineChart from "@/components/charts/QualifyingTimelineChart";
import { qualifyingParts, qualifyingTimeline, teammateBattles } from "@/lib/telemetry/analysis";
import { phasePrefix } from "@/lib/telemetry/derive";
import { formatLapTime } from "@/lib/telemetry/format";
import { useTelemetryStore } from "@/lib/telemetry/store";

export default function QualifyingAnalysis() {
  const session = useTelemetryStore((s) => s.session);
  const timeline = useTelemetryStore((s) => s.timeline);
  const drivers = useTelemetryStore((s) => s.drivers);
  const knockouts = useTelemetryStore((s) => s.knockouts);
  const styles = useCompareStyles();
  const prefix = phasePrefix(session?.session_name);

  const { data, battles } = useMemo(() => {
    if (!timeline) return { data: null, battles: [] };
    const parts = qualifyingParts(timeline, drivers, knockouts);
    return { data: qualifyingTimeline(timeline, drivers, parts), battles: teammateBattles(parts) };
  }, [timeline, drivers, knockouts]);

  if (!data || data.laps.length === 0) {
    return (
      <Card title="Qualifying analysis">
        <EmptyState>No flying laps were recorded for this session.</EmptyState>
      </Card>
    );
  }

  const sessionStart = data.parts[0].start;
  const lapsByTime = [...data.laps].sort((a, b) => a.t - b.t);

  return (
    <>
      <ChartCard
        title="Every flying lap"
        subtitle="Lap times against minutes into the session. The red line is the time needed to go through, tightening as laps come in"
        chart={<QualifyingTimelineChart data={data} styles={styles} prefix={prefix} />}
        table={
          <div className="max-h-[420px] overflow-auto">
            <table className={TABLE}>
              <thead className="sticky top-0 bg-[rgba(30,30,36,0.98)]">
                <tr>
                  <th className={TH}>Part</th>
                  <th className={TH_NUM}>Minute</th>
                  <th className={TH}>Driver</th>
                  <th className={TH_NUM}>Lap time</th>
                </tr>
              </thead>
              <tbody>
                {lapsByTime.map((lap, i) => (
                  <tr key={i} className={TR}>
                    <td className={`${TD} text-white/60`}>
                      {prefix}
                      {lap.part}
                    </td>
                    <td className={`${TD_NUM} text-white/60`}>{Math.round((lap.t - sessionStart) / 60000)}</td>
                    <td className={TD}>
                      <DriverName driver={lap.driver} full={false} />
                    </td>
                    <td className={`${TD_NUM} font-semibold`}>{formatLapTime(lap.time)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        }
      />

      <Card
        title="Teammates"
        subtitle="Who out-qualified whom, and by how much in the last part they both set a time in"
      >
        <div className="-mx-1 overflow-x-auto px-1">
          <table className={`${TABLE} min-w-[480px]`}>
            <thead>
              <tr>
                <th className={TH}>Team</th>
                <th className={TH}>Ahead</th>
                <th className={TH}>Behind</th>
                <th className={TH_NUM}>Gap</th>
              </tr>
            </thead>
            <tbody>
              {battles.map((b) => (
                <tr key={b.team} className={TR}>
                  <td className={`${TD} text-white/60`}>{b.team}</td>
                  <td className={TD}>
                    <DriverName driver={b.ahead} />
                  </td>
                  <td className={TD}>
                    <DriverName driver={b.behind} />
                  </td>
                  <td className={TD_NUM}>
                    {b.gap == null ? (
                      <span className="text-white/40">No shared time</span>
                    ) : (
                      <>
                        <span className="font-semibold">{b.gap.toFixed(3)} s</span>
                        <span className="ml-2 text-xs text-white/45">
                          {prefix}
                          {b.part}
                        </span>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
