"use client";

import Dropdown from "@/components/telemetry/Dropdown";
import { useTelemetryStore } from "@/lib/telemetry/store";
import { Session } from "@/lib/telemetry/types";

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
      <Dropdown
        label="Season"
        value={String(year)}
        options={years.map((y) => ({ value: String(y), label: String(y) }))}
        onChange={(v) => void loadYear(Number(v))}
        disabled={years.length < 2}
      />
      <Dropdown
        label="Grand Prix"
        value={String(session?.meeting_key ?? "")}
        options={meetings.map((weekend) => ({ value: String(weekend[0].meeting_key), label: meetingLabel(weekend) }))}
        onChange={handleMeetingChange}
        disabled={meetings.length === 0}
      />
      <Dropdown
        label="Session"
        value={String(session?.session_key ?? "")}
        options={meetingSessions.map((s) => ({ value: String(s.session_key), label: s.session_name }))}
        onChange={(v) => void selectSession(Number(v))}
        disabled={meetingSessions.length === 0}
      />
    </div>
  );
}
