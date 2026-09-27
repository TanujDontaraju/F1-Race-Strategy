"use client";

import { Play } from "lucide-react";
import { ReactNode, useMemo } from "react";
import CircuitOutline from "@/components/analysis/CircuitOutline";
import GlassPanel from "@/components/telemetry/GlassPanel";
import { weatherSummary } from "@/lib/telemetry/analysis";
import { useTelemetryStore } from "@/lib/telemetry/store";

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-white/50">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold tabular-nums">{children}</dd>
    </div>
  );
}

const degrees = (value: number | null) => (value == null ? "—" : `${value.toFixed(1)}°C`);

/** The session at a glance: where, when, the conditions, and a way into the replay. */
export default function SessionInfo({ laps }: { laps?: number }) {
  const session = useTelemetryStore((s) => s.session);
  const track = useTelemetryStore((s) => s.track);
  const weather = useTelemetryStore((s) => s.weather);
  const replay = useTelemetryStore((s) => s.replay);
  const setView = useTelemetryStore((s) => s.setView);

  const conditions = useMemo(
    () => (replay ? weatherSummary(weather, replay.start, replay.end) : null),
    [weather, replay]
  );
  if (!session) return null;

  const date = new Date(session.date_start).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const watch = () => {
    setView("pitwall");
    if (!useTelemetryStore.getState().isPlaying) useTelemetryStore.getState().togglePlay();
  };

  return (
    <GlassPanel className="flex flex-wrap items-center gap-x-8 gap-y-4 p-4 sm:p-5" aria-label="Session">
      <div className="flex min-w-0 items-center gap-4">
        {track && <CircuitOutline track={track} className="h-16 w-20 shrink-0" />}
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-white/55">{session.session_name}</p>
          <p className="truncate text-xl font-bold tracking-tight">{session.circuit_short_name}</p>
          <p className="truncate text-xs font-medium text-white/55">
            {session.location === session.circuit_short_name ? "" : `${session.location}, `}
            {session.country_name} · {date}
          </p>
        </div>
      </div>

      <dl className="grid basis-full grid-cols-3 gap-x-4 gap-y-3 sm:flex-1 sm:basis-auto sm:grid-cols-6 sm:gap-x-6">
        {laps != null && <Fact label="Laps">{laps}</Fact>}
        <Fact label="Air">{degrees(conditions?.air ?? null)}</Fact>
        <Fact label="Track">
          {degrees(conditions?.track ?? null)}
          {conditions?.trackRange && conditions.trackRange[1] - conditions.trackRange[0] >= 1 && (
            <span className="block text-[11px] font-medium text-white/45">
              {conditions.trackRange[0].toFixed(0)}–{conditions.trackRange[1].toFixed(0)}° during
            </span>
          )}
        </Fact>
        <Fact label="Humidity">{conditions?.humidity == null ? "—" : `${conditions.humidity.toFixed(0)}%`}</Fact>
        <Fact label="Wind">{conditions?.wind == null ? "—" : `${conditions.wind.toFixed(1)} km/h`}</Fact>
        <Fact label="Rain">{conditions ? (conditions.rained ? "Yes" : "None") : "—"}</Fact>
      </dl>

      <button
        type="button"
        onClick={watch}
        className="glass-chrome flex w-full shrink-0 items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold sm:w-auto outline-none transition-transform duration-100 ease-out hover:bg-white/10 focus-visible:ring-1 focus-visible:ring-white/50 active:scale-[0.97]"
      >
        <Play size={14} fill="currentColor" aria-hidden />
        Watch replay
      </button>
    </GlassPanel>
  );
}
