"use client";

import Image from "next/image";
import { ReactNode, useState } from "react";
import GlassPanel from "@/components/telemetry/GlassPanel";
import TyreBadge, { tyreLabel } from "@/components/telemetry/TyreBadge";
import { telemetryBuffer } from "@/lib/telemetry/buffer";
import { bestLap, completedLaps, currentLap, positionAt, tyreAt } from "@/lib/telemetry/derive";
import { formatGap, formatLapTime, largeHeadshot, teamColour } from "@/lib/telemetry/format";
import { useTelemetryStore } from "@/lib/telemetry/store";

const TABS = ["Telemetry", "Timing", "Tyres"] as const;
type Tab = (typeof TABS)[number];

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <dl className="flex items-center justify-between gap-3 py-1.5">
      <dt className="text-sm text-white/65">{label}</dt>
      <dd className="text-sm font-semibold tabular-nums">{children}</dd>
    </dl>
  );
}

function Bar({ label, value, colour }: { label: string; value: number; colour: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="py-1.5">
      <div className="mb-1 flex justify-between text-sm">
        <span className="text-white/65">{label}</span>
        <span className="font-semibold tabular-nums">{Math.round(pct)}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full transition-[width] duration-150 ease-out"
          style={{ width: `${pct}%`, background: colour }}
        />
      </div>
    </div>
  );
}

export default function DriverDetailPanel() {
  const selectedDriver = useTelemetryStore((s) => s.selectedDriver);
  const drivers = useTelemetryStore((s) => s.drivers);
  const timeline = useTelemetryStore((s) => s.timeline);
  const session = useTelemetryStore((s) => s.session);
  const time = useTelemetryStore((s) => s.displayCursor);
  const [tab, setTab] = useState<Tab>("Telemetry");

  const driver = drivers.find((d) => d.driver_number === selectedDriver);
  if (!driver || !timeline) {
    return (
      <GlassPanel className="flex items-center justify-center p-6 text-sm text-white/55" aria-label="Driver detail">
        {timeline ? "Select a driver" : "No driver data"}
      </GlassPanel>
    );
  }

  const n = driver.driver_number;
  const colour = teamColour(driver);
  const isRace = session?.session_type === "Race";
  const position = positionAt(timeline, n, time);
  const lap = currentLap(timeline, n, time);
  const tyre = tyreAt(timeline, n, lap);
  const car = telemetryBuffer.sampleCar(n, time);
  const interval = isRace ? telemetryBuffer.sampleInterval(n, time) : null;
  const lastLap = completedLaps(timeline, n, time).at(-1) ?? null;
  const best = bestLap(timeline, n, time);
  const stints = (timeline.stints.get(n) ?? []).filter((s) => lap == null || s.lap_start <= lap);

  return (
    <GlassPanel className="flex min-h-0 flex-col gap-4 overflow-y-auto p-4" aria-label="Driver detail">
      <div
        className="relative h-44 shrink-0 overflow-hidden rounded-[20px]"
        style={{ background: `radial-gradient(120% 90% at 50% 100%, ${colour}66, transparent 70%), rgba(255,255,255,0.04)` }}
      >
        {driver.headshot_url ? (
          <Image
            src={largeHeadshot(driver.headshot_url)}
            alt={driver.full_name}
            width={432}
            height={432}
            className="absolute inset-x-0 bottom-0 mx-auto h-full w-auto object-contain object-bottom"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-4xl font-bold text-white/40">
            {driver.name_acronym}
          </div>
        )}
      </div>

      <div className="flex items-end gap-3 px-1">
        <span className="text-4xl font-bold leading-none tabular-nums">{position ?? "–"}</span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-white/60">{driver.first_name}</p>
          <p className="truncate text-xl font-bold leading-tight tracking-tight">{driver.last_name}</p>
        </div>
        <span className="text-2xl font-bold tabular-nums" style={{ color: colour }}>
          {n}
        </span>
      </div>
      <p className="-mt-2 flex items-center gap-2 px-1 text-xs font-medium text-white/65">
        <span className="h-2 w-2 rounded-full" style={{ background: colour }} />
        {driver.team_name}
      </p>

      <div role="tablist" aria-label="Driver data" className="grid grid-cols-3 gap-1 rounded-full bg-black/30 p-1">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`rounded-full py-1.5 text-xs font-semibold transition-[background-color,color,transform] duration-100 ease-out active:scale-95 ${
              tab === t ? "bg-white/15 text-white" : "text-white/55 hover:text-white/80"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="px-1" role="tabpanel" aria-label={tab}>
        {tab === "Telemetry" &&
          (car ? (
            <>
              <dl className="grid grid-cols-2 gap-3 pb-2">
                <div>
                  <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-white/55">Speed</dt>
                  <dd className="text-3xl font-bold tabular-nums">
                    {car.speed}
                    <span className="ml-1 text-sm font-medium text-white/55">km/h</span>
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-white/55">Gear</dt>
                  <dd className="text-3xl font-bold tabular-nums">{car.gear === 0 ? "N" : car.gear}</dd>
                </div>
              </dl>
              <Row label="RPM">{car.rpm.toLocaleString()}</Row>
              <Bar label="Throttle" value={car.throttle} colour="#30d158" />
              <Bar label="Brake" value={car.brake} colour="#ff453a" />
            </>
          ) : (
            <p className="py-4 text-center text-sm text-white/50">No car telemetry at this moment</p>
          ))}

        {tab === "Timing" && (
          <>
            <Row label="Lap">{lap ?? "—"}</Row>
            {isRace && <Row label="Gap to leader">{position === 1 ? "Leader" : formatGap(interval?.gap ?? null)}</Row>}
            {isRace && <Row label="Interval">{position === 1 ? "—" : formatGap(interval?.interval ?? null)}</Row>}
            <Row label="Last lap">{formatLapTime(lastLap?.duration)}</Row>
            <Row label="Best lap">{formatLapTime(best?.duration)}</Row>
            {lastLap &&
              lastLap.sectors.map((sector, i) => (
                <Row key={i} label={`Last lap · S${i + 1}`}>
                  {formatLapTime(sector)}
                </Row>
              ))}
          </>
        )}

        {tab === "Tyres" && (
          <>
            <Row label="Compound">
              <span className="flex items-center gap-2">
                {tyreLabel(tyre?.compound)}
                <TyreBadge compound={tyre?.compound} size={20} />
              </span>
            </Row>
            <Row label="Age">{tyre?.age != null ? `${tyre.age} laps` : "—"}</Row>
            <Row label="Stint">{tyre?.stint ?? "—"}</Row>
            {stints.length > 0 && (
              <div className="mt-3 border-t border-white/10 pt-3">
                <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.08em] text-white/55">Stint history</p>
                {stints.map((s) => (
                  <div key={s.stint_number} className="flex items-center justify-between py-1 text-sm">
                    <span className="flex items-center gap-2 text-white/75">
                      <TyreBadge compound={s.compound} size={16} />
                      Stint {s.stint_number}
                    </span>
                    <span className="tabular-nums text-white/65">
                      Laps {s.lap_start}–{lap != null && (s.lap_end == null || s.lap_end > lap) ? lap : s.lap_end}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </GlassPanel>
  );
}
