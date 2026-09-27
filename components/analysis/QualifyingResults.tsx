"use client";

import { Fragment, useMemo } from "react";
import { Card, DriverName, EmptyState, StatTile, TABLE, TD, TD_NUM, TH, TH_NUM, TR } from "@/components/analysis/parts";
import SessionInfo from "@/components/analysis/SessionInfo";
import { QualifyingPart, qualifyingParts, sessionFacts } from "@/lib/telemetry/analysis";
import { phasePrefix } from "@/lib/telemetry/derive";
import { formatLapTime } from "@/lib/telemetry/format";
import { useTelemetryStore } from "@/lib/telemetry/store";

function PartTable({ part, prefix, isFinal }: { part: QualifyingPart; prefix: string; isFinal: boolean }) {
  const through = part.rows.filter((r) => !r.eliminated).length;
  const out = part.rows.length - through;
  return (
    <Card
      title={`${prefix}${part.number}`}
      subtitle={isFinal ? `Top ${part.rows.length} shootout` : `${part.rows.length} drivers · bottom ${out} out`}
    >
      <table className={TABLE}>
        <thead>
          <tr>
            <th className={`${TH_NUM} w-7`}>Pos</th>
            <th className={TH}>Driver</th>
            <th className={TH_NUM}>Time</th>
            <th className={TH_NUM}>Gap</th>
          </tr>
        </thead>
        <tbody>
          {part.rows.map((row, i) => (
            <Fragment key={row.driver.driver_number}>
              {/* The cutoff: everyone below it went out in this part. */}
              {i === through && out > 0 && (
                <tr aria-hidden>
                  <td colSpan={4} className="px-1 pb-1 pt-3">
                    <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-f1-red">
                      Knocked out
                      <span className="h-px flex-1 bg-f1-red/50" />
                    </span>
                  </td>
                </tr>
              )}
              <tr className={i === through ? "" : TR}>
                <td className={`${TD_NUM} font-medium text-white/60`}>{i + 1}</td>
                <td className={TD}>
                  <DriverName driver={row.driver} full={false} />
                </td>
                <td className={`${TD_NUM} ${row.best == null ? "text-white/40" : "font-semibold"}`}>
                  {row.best == null ? "No time" : formatLapTime(row.best)}
                </td>
                <td className={`${TD_NUM} text-white/60`}>
                  {row.gap == null ? "" : row.gap === 0 ? "—" : `+${row.gap.toFixed(3)}`}
                </td>
              </tr>
            </Fragment>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

export default function QualifyingResults() {
  const session = useTelemetryStore((s) => s.session);
  const timeline = useTelemetryStore((s) => s.timeline);
  const drivers = useTelemetryStore((s) => s.drivers);
  const knockouts = useTelemetryStore((s) => s.knockouts);
  const prefix = phasePrefix(session?.session_name);

  const { parts, facts } = useMemo(() => {
    if (!timeline) return { parts: [], facts: null };
    return { parts: qualifyingParts(timeline, drivers, knockouts), facts: sessionFacts(timeline, drivers) };
  }, [timeline, drivers, knockouts]);
  const [pole, second] = parts.at(-1)?.rows ?? [];

  return (
    <>
      <SessionInfo />

      {facts && (
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Pole" value={pole?.driver.name_acronym ?? "—"} detail={pole && formatLapTime(pole.best)} />
          <StatTile
            label="Pole margin"
            value={second?.gap != null ? `${second.gap.toFixed(3)} s` : "—"}
            detail={second && `to ${second.driver.name_acronym}`}
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
        </dl>
      )}

      {parts.length === 0 ? (
        <Card title="Results">
          <EmptyState>No qualifying parts were recorded for this session.</EmptyState>
        </Card>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-3">
          {parts.map((part, i) => (
            <PartTable key={part.number} part={part} prefix={prefix} isFinal={i === parts.length - 1} />
          ))}
        </div>
      )}
    </>
  );
}
