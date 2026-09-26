"use client";

import { ChevronDown } from "lucide-react";
import { ReactNode } from "react";
import { useTelemetryStore } from "@/lib/telemetry/store";
import { Session } from "@/lib/telemetry/types";

function Select({
  label,
  value,
  onChange,
  disabled,
  children,
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="relative">
      <select
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none rounded-full border border-white/10 bg-white/[0.07] py-1.5 pl-3.5 pr-8 text-sm font-medium text-white transition-colors hover:bg-white/[0.11] disabled:opacity-40"
      >
        {children}
      </select>
      <ChevronDown
        size={14}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-white/60"
        aria-hidden
      />
    </div>
  );
}

function groupByMeeting(sessions: Session[]): Session[][] {
  const groups = new Map<number, Session[]>();
  for (const s of sessions) groups.set(s.meeting_key, [...(groups.get(s.meeting_key) ?? []), s]);
  return [...groups.values()];
}

function meetingLabel(weekend: Session[]): string {
  const [first] = weekend;
  // Pre-season testing weekends only have "Day 1".."Day 3" sessions and can share a venue.
  if (weekend.every((s) => s.session_name.startsWith("Day "))) {
    const date = new Date(first.date_start).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
    return `Testing · ${first.circuit_short_name} (${date})`;
  }
  return `${first.country_name} · ${first.circuit_short_name}`;
}

export default function SessionPicker() {
  const years = useTelemetryStore((s) => s.years);
  const year = useTelemetryStore((s) => s.year);
  const sessions = useTelemetryStore((s) => s.sessions);
  const session = useTelemetryStore((s) => s.session);
  const loadYear = useTelemetryStore((s) => s.loadYear);
  const selectSession = useTelemetryStore((s) => s.selectSession);

  // Most recent weekend first.
  const meetings = groupByMeeting(sessions).reverse();
  const meetingSessions = sessions.filter((s) => s.meeting_key === session?.meeting_key);

  const handleMeetingChange = (meetingKey: string) => {
    const weekend = sessions.filter((s) => s.meeting_key === Number(meetingKey));
    const latest = weekend[weekend.length - 1];
    if (latest) void selectSession(latest.session_key);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select label="Season" value={year} onChange={(v) => void loadYear(Number(v))} disabled={years.length < 2}>
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </Select>
      <Select
        label="Grand Prix"
        value={session?.meeting_key ?? ""}
        onChange={handleMeetingChange}
        disabled={meetings.length === 0}
      >
        {meetings.map((weekend) => (
          <option key={weekend[0].meeting_key} value={weekend[0].meeting_key}>
            {meetingLabel(weekend)}
          </option>
        ))}
      </Select>
      <Select
        label="Session"
        value={session?.session_key ?? ""}
        onChange={(v) => void selectSession(Number(v))}
        disabled={meetingSessions.length === 0}
      >
        {meetingSessions.map((s) => (
          <option key={s.session_key} value={s.session_key}>
            {s.session_name}
          </option>
        ))}
      </Select>
    </div>
  );
}
