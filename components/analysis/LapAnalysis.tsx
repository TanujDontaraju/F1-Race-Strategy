"use client";

import { useMemo, useState } from "react";
import DominanceMap from "@/components/analysis/DominanceMap";
import { Card, EmptyState, TABLE, TD, TD_NUM, TH, TH_NUM, TR } from "@/components/analysis/parts";
import { useCompareStyles } from "@/components/analysis/useRaceData";
import { useLapTelemetry } from "@/components/analysis/useLapTelemetry";
import ChartCard from "@/components/charts/ChartCard";
import { LineKey } from "@/components/charts/common";
import TraceStack, { Trace } from "@/components/charts/TraceStack";
import Dropdown from "@/components/telemetry/Dropdown";
import GlassPanel from "@/components/telemetry/GlassPanel";
import SegmentedControl from "@/components/telemetry/SegmentedControl";
import { TimedLap } from "@/lib/telemetry/derive";
import { formatLapTime } from "@/lib/telemetry/format";
import {
  deltaTrace,
  dominance,
  fastestLapOf,
  interpolate,
  lapOf,
  miniSectorTimes,
  MINI_SECTORS,
  scaleTo,
} from "@/lib/telemetry/lapAnalysis";
import { SeriesStyle } from "@/lib/telemetry/seriesColours";
import { LapTelemetry } from "@/lib/telemetry/types";
import { useTelemetryStore } from "@/lib/telemetry/store";
import { sessionKind } from "@/lib/telemetry/views";

const MODES = ["Fastest laps", "Same lap"] as const;
type Mode = (typeof MODES)[number];

const signed = (v: number, digits = 3) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(digits)}`;

/** Sector times with the quickest in each column marked, the rest as gaps to it. */
function SectorTable({ rows }: { rows: { style: SeriesStyle; lap: TimedLap | null }[] }) {
  const columns: { label: string; value: (l: TimedLap) => number | null; higherIsBetter?: boolean }[] = [
    { label: "S1", value: (l) => l.sectors[0] },
    { label: "S2", value: (l) => l.sectors[1] },
    { label: "S3", value: (l) => l.sectors[2] },
    { label: "Lap", value: (l) => l.duration },
    { label: "Trap", value: (l) => l.speedTrap, higherIsBetter: true },
  ];
  const best = columns.map((c) => {
    const values = rows.map((r) => (r.lap ? c.value(r.lap) : null)).filter((v): v is number => v != null);
    return values.length ? (c.higherIsBetter ? Math.max(...values) : Math.min(...values)) : null;
  });

  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <table className={`${TABLE} min-w-[480px]`}>
        <thead>
          <tr>
            <th className={TH}>Driver</th>
            <th className={TH_NUM}>Lap</th>
            {columns.map((c) => (
              <th key={c.label} className={TH_NUM}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ style, lap }) => (
            <tr key={style.driver.driver_number} className={TR}>
              <td className={TD}>
                <span className="flex items-center gap-2 font-bold">
                  <LineKey colour={style.colour} dashed={style.dashed} width={12} />
                  {style.driver.name_acronym}
                </span>
              </td>
              <td className={`${TD_NUM} text-white/60`}>{lap?.lap ?? "—"}</td>
              {columns.map((c, i) => {
                const v = lap ? c.value(lap) : null;
                if (v == null) {
                  return (
                    <td key={c.label} className={`${TD_NUM} text-white/35`}>
                      —
                    </td>
                  );
                }
                const isBest = v === best[i];
                const text = c.higherIsBetter ? `${v}` : formatLapTime(v);
                const gap = best[i] == null || isBest ? null : signed(v - best[i]!, c.higherIsBetter ? 0 : 3);
                return (
                  <td key={c.label} className={TD_NUM}>
                    <span
                      className={
                        isBest && rows.length > 1
                          ? "rounded-md bg-violet-500/25 px-1.5 py-0.5 font-semibold text-violet-100"
                          : "font-medium"
                      }
                    >
                      {text}
                    </span>
                    {gap && <span className="block text-[11px] text-white/45">{gap}</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function LapAnalysis() {
  const session = useTelemetryStore((s) => s.session);
  const timeline = useTelemetryStore((s) => s.timeline);
  const track = useTelemetryStore((s) => s.track);
  const styles = useCompareStyles();
  const isRace = sessionKind(session) === "race";
  const [mode, setMode] = useState<Mode>("Fastest laps");
  const [chosenLap, setChosenLap] = useState<number | null>(null);

  const lapCount = useMemo(() => {
    if (!timeline) return 0;
    return Math.max(0, ...styles.map((s) => (timeline.laps.get(s.driver.driver_number) ?? []).at(-1)?.lap ?? 0));
  }, [timeline, styles]);
  const sameLap = isRace && mode === "Same lap";
  // Until a lap is picked, the first driver's quickest one.
  const defaultLap = styles[0] && timeline ? fastestLapOf(timeline, styles[0].driver.driver_number)?.lap : undefined;
  const lapNumber = Math.min(chosenLap ?? defaultLap ?? 1, Math.max(lapCount, 1));

  const selections = useMemo(
    () =>
      styles.map((style) => ({
        style,
        lap: !timeline
          ? null
          : sameLap
            ? lapOf(timeline, style.driver.driver_number, lapNumber)
            : fastestLapOf(timeline, style.driver.driver_number),
      })),
    [styles, timeline, sameLap, lapNumber]
  );
  const requests = useMemo(
    () => selections.flatMap((s) => (s.lap ? [{ driver: s.style.driver.driver_number, lap: s.lap.lap }] : [])),
    [selections]
  );
  const { laps, loading, ready } = useLapTelemetry(session?.session_key ?? null, requests);

  // The loaded laps with their chart styles; the quickest is the reference the others are timed against.
  const shown = useMemo(() => {
    const withStyle = laps.flatMap((l) => {
      const style = styles.find((s) => s.driver.driver_number === l.driver);
      return style ? [{ ...l, style }] : [];
    });
    const reference = withStyle.reduce<(typeof withStyle)[number] | null>(
      (best, l) =>
        !best || (l.telemetry.lap_duration ?? Infinity) < (best.telemetry.lap_duration ?? Infinity) ? l : best,
      null
    );
    return { laps: withStyle, reference };
  }, [laps, styles]);

  const traces = useMemo((): Trace[] => {
    const ref = shown.reference?.telemetry;
    if (!ref) return [];
    const channel = (pick: (car: LapTelemetry["car"]) => number[]) =>
      shown.laps.map(({ style, telemetry }) => ({
        key: style.driver.driver_number,
        label: style.driver.name_acronym,
        colour: style.colour,
        dashed: style.dashed,
        x: scaleTo(telemetry.car.distance, telemetry.length, ref.length),
        y: pick(telemetry.car),
      }));
    return [
      {
        id: "delta",
        title: `Gap to ${shown.reference!.style.driver.name_acronym}, s`,
        height: 90,
        series: shown.laps.map(({ style, telemetry }) => {
          const d = deltaTrace(telemetry, ref);
          return {
            key: style.driver.driver_number,
            label: style.driver.name_acronym,
            colour: style.colour,
            dashed: style.dashed,
            x: d.distance,
            y: d.delta,
          };
        }),
        format: (v) => signed(v, Math.abs(v) >= 10 ? 1 : 2),
      },
      { id: "speed", title: "Speed, km/h", height: 160, series: channel((c) => c.speed), format: (v) => `${Math.round(v)}` },
      {
        id: "throttle",
        title: "Throttle, %",
        height: 64,
        series: channel((c) => c.throttle),
        format: (v) => `${Math.round(v)}`,
        domain: [0, 100],
        ticks: [0, 100],
      },
      {
        id: "brake",
        title: "Brake",
        height: 40,
        series: channel((c) => c.brake),
        format: (v) => (v >= 50 ? "On" : "Off"),
        domain: [0, 100],
        ticks: [0, 100],
        step: true,
      },
      {
        id: "gear",
        title: "Gear",
        height: 70,
        series: channel((c) => c.n_gear),
        format: (v) => `${Math.round(v)}`,
        domain: [1, 8],
        ticks: [2, 4, 6, 8],
        step: true,
      },
      {
        id: "rpm",
        title: "RPM",
        height: 70,
        series: channel((c) => c.rpm),
        format: (v) => `${(v / 1000).toFixed(1)}k`,
      },
    ];
  }, [shown]);

  const winners = useMemo(() => dominance(shown.laps.map((l) => l.telemetry)), [shown]);
  const miniTimes = useMemo(() => shown.laps.map((l) => miniSectorTimes(l.telemetry)), [shown]);

  if (styles.length === 0 || !timeline) {
    return (
      <Card title="Lap analysis">
        <EmptyState>Pick drivers to compare from the menu at the top.</EmptyState>
      </Card>
    );
  }

  const missing = selections.filter((s) => !s.lap).map((s) => s.style.driver.name_acronym);
  const noTelemetry = requests
    .filter((r) => ready && !loading && !laps.some((l) => l.driver === r.driver))
    .map((r) => styles.find((s) => s.driver.driver_number === r.driver)?.driver.name_acronym);
  const dim = loading ? "opacity-50 transition-opacity" : "transition-opacity";

  return (
    <>
      {/* One row of controls above everything they scope. */}
      <GlassPanel className="flex flex-wrap items-center gap-3 px-4 py-3" aria-label="Lap choice">
        {isRace && <SegmentedControl label="Laps compared" kind="radio" options={MODES} value={mode} onChange={setMode} />}
        {sameLap && (
          <Dropdown
            label="Lap"
            value={String(lapNumber)}
            options={Array.from({ length: lapCount }, (_, i) => ({ value: String(i + 1), label: `Lap ${i + 1}` }))}
            onChange={(v) => setChosenLap(Number(v))}
          />
        )}
        <p className="text-xs font-medium text-white/55">
          {sameLap ? "Everyone on the same lap" : "Each driver's quickest lap"}
          {missing.length > 0 && ` · no lap for ${missing.join(", ")}`}
          {noTelemetry.length > 0 && ` · no telemetry for ${noTelemetry.join(", ")}`}
          {loading && " · loading telemetry…"}
        </p>
      </GlassPanel>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Card title="Sectors" subtitle="The quickest in each column is highlighted; the rest show the gap to it">
          <SectorTable rows={selections} />
        </Card>

        {track && shown.laps.length > 0 && (
          <ChartCard
            title="Track dominance"
            subtitle="Who was quickest through each part of the lap"
            className={dim}
            chart={<DominanceMap track={track} styles={shown.laps.map((l) => l.style)} winners={winners} />}
            table={
              <div className="max-h-[420px] overflow-auto">
                <table className={TABLE}>
                  <thead>
                    <tr>
                      <th className={TH}>Mini-sector</th>
                      {shown.laps.map((l) => (
                        <th key={l.driver} className={TH_NUM}>
                          {l.style.driver.name_acronym}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: MINI_SECTORS }, (_, s) => (
                      <tr key={s} className={TR}>
                        <td className={`${TD} tabular-nums text-white/60`}>{s + 1}</td>
                        {miniTimes.map((times, i) => (
                          <td key={i} className={`${TD_NUM} ${winners[s] === i ? "font-semibold" : "text-white/65"}`}>
                            {times[s].toFixed(2)} s
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            }
          />
        )}
      </div>

      {shown.reference && (
        <ChartCard
          title="Telemetry"
          subtitle="Against distance round the lap. Hover or use the arrow keys to read every channel at one point"
          className={dim}
          chart={<TraceStack traces={traces} length={shown.reference.telemetry.length} label="Lap telemetry traces" />}
          table={
            <div className="max-h-[420px] overflow-auto">
              <table className={TABLE}>
                <thead className="sticky top-0 bg-[rgba(30,30,36,0.98)]">
                  <tr>
                    <th className={TH}>Distance</th>
                    {traces[1]?.series.map((s) => (
                      <th key={s.key} className={TH_NUM}>
                        {s.label} km/h
                      </th>
                    ))}
                    {traces[0]?.series.map((s) => (
                      <th key={s.key} className={TH_NUM}>
                        {s.label} gap
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: Math.floor(shown.reference.telemetry.length / 100) + 1 }, (_, i) => i * 100).map(
                    (d) => (
                      <tr key={d} className={TR}>
                        <td className={`${TD} tabular-nums text-white/60`}>{d} m</td>
                        {traces[1]?.series.map((s) => (
                          <td key={s.key} className={TD_NUM}>
                            {Math.round(interpolate(s.x, s.y, d))}
                          </td>
                        ))}
                        {traces[0]?.series.map((s) => (
                          <td key={s.key} className={`${TD_NUM} text-white/70`}>
                            {signed(interpolate(s.x, s.y, d), 2)}
                          </td>
                        ))}
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          }
        />
      )}
    </>
  );
}
