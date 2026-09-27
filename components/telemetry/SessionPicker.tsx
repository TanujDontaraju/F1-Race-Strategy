"use client";

import Dropdown from "@/components/telemetry/Dropdown";
import SegmentedControl from "@/components/telemetry/SegmentedControl";
import { useTelemetryStore } from "@/lib/telemetry/store";
import { Session } from "@/lib/telemetry/types";
import { sessionShortName } from "@/lib/telemetry/views";

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

  // Filter out testing sessions (those with "Day" session names)
  const nonTestingSessions = sessions.filter((s) => !s.session_name.startsWith("Day "));

  // Most recent weekend first.
  const meetings = groupByMeeting(nonTestingSessions).reverse();
  const meetingSessions = nonTestingSessions.filter((s) => s.meeting_key === session?.meeting_key);

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
      {session && meetingSessions.length > 0 && (
        <SegmentedControl
          kind="radio"
          label="Session"
          options={meetingSessions.map((s) => s.session_key)}
          value={session.session_key}
          onChange={(key) => void selectSession(key)}
          getLabel={(key) => {
            const match = meetingSessions.find((s) => s.session_key === key);
            return match ? sessionShortName(match) : "";
          }}
        />
      )}
    </div>
  );
}
