"use client";

import { ArrowRight } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";
import GlassPanel from "@/components/telemetry/GlassPanel";
import { parseDate } from "@/lib/telemetry/format";
import { currentTime, formatWeekendDates } from "@/lib/telemetry/schedule";
import { useTelemetryStore } from "@/lib/telemetry/store";

const TICK_MS = 15_000;
// A session that has started shows as under way until its live timing is picked up.
const UNDER_WAY_MS = 2 * 60 * 60 * 1000;

function useNow() {
  const [now, setNow] = useState(currentTime);
  useEffect(() => {
    const timer = setInterval(() => setNow(currentTime()), TICK_MS);
    return () => clearInterval(timer);
  }, []);
  return now;
}

function countdown(ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

const dayFormat = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" });
const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const zoneName =
  new Intl.DateTimeFormat(undefined, { timeZoneName: "short" })
    .formatToParts(new Date())
    .find((p) => p.type === "timeZoneName")?.value ?? "your time zone";

/** The race week's sessions in the viewer's local time, counting down to the next one. */
export function WeekendSchedule() {
  const week = useTelemetryStore((s) => s.raceWeek);
  const now = useNow();
  if (!week) return null;

  const next = week.sessions.find((s) => s.start > now);
  const underWay = week.sessions.findLast((s) => s.start <= now && now - s.start < UNDER_WAY_MS);

  return (
    <GlassPanel className="flex min-h-0 flex-col p-2" aria-label="Weekend schedule">
      <header className="flex flex-col items-center gap-1 px-3 pb-3 pt-4">
        <Image src="/f1-logo.png" alt="F1" width={666} height={375} loading="eager" className="-my-2 h-auto w-20" />
        <p className="mt-1 text-sm font-semibold uppercase tracking-[0.14em] text-white/85">Race week</p>
        <p className="text-xs font-medium tabular-nums text-white/55">{formatWeekendDates(week)}</p>
      </header>

      <div className="mx-3 h-px bg-white/10" />

      <ol className="flex flex-col gap-0.5 py-2">
        {week.sessions.map((session) => {
          const done = session.start <= now;
          const isNext = session === next;
          return (
            <li
              key={session.name}
              aria-current={isNext ? "true" : undefined}
              className={`flex items-center justify-between gap-3 rounded-2xl px-4 py-2.5 ${isNext ? "bg-white/[0.07]" : ""}`}
            >
              <div className="min-w-0">
                <p className={`truncate text-sm font-semibold ${done ? "text-white/45" : "text-white"}`}>{session.name}</p>
                <p className="text-xs font-medium tabular-nums text-white/50">{dayFormat.format(session.start)}</p>
              </div>
              <p className={`shrink-0 text-sm font-semibold tabular-nums ${done ? "text-white/45" : "text-white/90"}`}>
                {timeFormat.format(session.start)}
              </p>
            </li>
          );
        })}
      </ol>

      <footer className="mt-auto flex flex-col items-center gap-0.5 px-4 pb-4 pt-2 text-center">
        {underWay ? (
          <>
            <p className="flex items-center gap-1.5 text-sm font-semibold">
              <span className="h-1.5 w-1.5 rounded-full bg-f1-red" aria-hidden />
              {underWay.name} under way
            </p>
            <p className="text-xs font-medium text-white/55">Live timing appears here in a few minutes.</p>
          </>
        ) : next ? (
          <>
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-white/55">{next.name} starts in</p>
            <p className="text-2xl font-bold tabular-nums tracking-tight" aria-live="polite">
              {countdown(next.start - now)}
            </p>
          </>
        ) : null}
        <p className="mt-2 text-[11px] font-medium text-white/40">Times in {zoneName}</p>
      </footer>
    </GlassPanel>
  );
}

/** The most recent race this season, one tap from a replay. */
export function LastRace() {
  const sessions = useTelemetryStore((s) => s.sessions);
  const selectSession = useTelemetryStore((s) => s.selectSession);
  const race = sessions.findLast((s) => s.session_name === "Race");

  return (
    <GlassPanel className="flex flex-col items-center justify-center gap-4 p-6 text-center" aria-label="Last race">
      {race ? (
        <>
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-white/55">Last race</p>
          <div>
            <p className="text-lg font-bold tracking-tight">{race.country_name}</p>
            <p className="text-xs font-medium text-white/55">
              {race.circuit_short_name} · {dayFormat.format(parseDate(race.date_start))}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void selectSession(race.session_key)}
            className="intro-cta group flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white outline-none transition-[background-color,transform] duration-150 ease-out active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-white/50"
          >
            Replay the race
            <ArrowRight size={16} aria-hidden className="transition-transform duration-200 ease-out group-hover:translate-x-0.5" />
          </button>
        </>
      ) : (
        <p className="text-sm text-white/55">No races yet this season</p>
      )}
    </GlassPanel>
  );
}
