"use client";

import Image from "next/image";
import { useMemo } from "react";
import GlassPanel from "@/components/telemetry/GlassPanel";
import TyreBadge from "@/components/telemetry/TyreBadge";
import { buildLeaderboard, phaseLabelAt } from "@/lib/telemetry/derive";
import { teamColour } from "@/lib/telemetry/format";
import { useTelemetryStore } from "@/lib/telemetry/store";

export default function LeaderboardPanel() {
  const session = useTelemetryStore((s) => s.session);
  const timeline = useTelemetryStore((s) => s.timeline);
  const drivers = useTelemetryStore((s) => s.drivers);
  const displayCursor = useTelemetryStore((s) => s.displayCursor);
  const selectedDriver = useTelemetryStore((s) => s.selectedDriver);
  const selectDriver = useTelemetryStore((s) => s.selectDriver);

  const isRace = session?.session_type === "Race";
  const rows = useMemo(
    () => (timeline ? buildLeaderboard(timeline, drivers, isRace, displayCursor) : []),
    [timeline, drivers, isRace, displayCursor]
  );
  const leaderLap = rows[0]?.lap;
  const phase = timeline ? phaseLabelAt(timeline, displayCursor) : null;
  const subtitle = isRace
    ? leaderLap ? `Lap ${leaderLap}` : ""
    : [phase, session?.circuit_short_name].filter(Boolean).join(" · ");

  return (
    <GlassPanel className="flex min-h-0 flex-col p-2" aria-label="Leaderboard">
      <header className="flex flex-col items-center gap-1 px-3 pb-3 pt-4">
        <Image src="/f1-logo.png" alt="F1" width={666} height={375} className="-my-2 h-auto w-20" />
        <p className="mt-1 text-sm font-semibold uppercase tracking-[0.14em] text-white/85">
          {session?.session_name ?? "—"}
        </p>
        <p className="text-xs font-medium tabular-nums text-white/55">{subtitle}</p>
      </header>

      <div className="mx-3 h-px bg-white/10" />

      {rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-white/50">No timing data</p>
      ) : (
        <ol className="min-h-0 flex-1 overflow-y-auto py-2">
          {rows.map((row) => {
            const selected = row.driverNumber === selectedDriver;
            return (
              <li key={row.driverNumber}>
                <button
                  type="button"
                  onClick={() => selectDriver(row.driverNumber)}
                  aria-pressed={selected}
                  aria-label={`P${row.position ?? "–"} ${row.driver.full_name}, ${row.gapLabel}`}
                  className={`grid w-full grid-cols-[1.5rem_3px_1fr_auto_20px] items-center gap-2.5 rounded-2xl px-3 py-[5px] text-left transition-[background-color,transform] duration-100 ease-out active:scale-[0.98] ${
                    selected ? "bg-white/[0.12]" : "hover:bg-white/[0.05]"
                  }`}
                >
                  <span className="text-right text-sm font-medium tabular-nums text-white/60">
                    {row.position ?? "–"}
                  </span>
                  <span className="h-4 w-[3px] rounded-full" style={{ background: teamColour(row.driver) }} />
                  <span className="text-sm font-bold tracking-[0.04em]">{row.driver.name_acronym}</span>
                  <span
                    className={`text-xs font-medium tabular-nums ${
                      row.isCarriedOver
                        ? "text-white/40"
                        : row.isLeader
                          ? "tracking-[0.08em] text-white/80"
                          : "text-white/65"
                    }`}
                  >
                    {row.gapLabel}
                  </span>
                  <TyreBadge compound={row.tyre?.compound} size={18} />
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </GlassPanel>
  );
}
