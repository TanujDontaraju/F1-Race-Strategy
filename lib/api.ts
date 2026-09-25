import scheduleData from "@/mock/schedule.json";
import sessionData from "@/mock/session.json";

export interface ScheduleEvent {
  eventName: string;
  roundNumber: number;
}

export interface SessionDriver {
  abbr: string;
  fullName: string;
  teamName: string;
}

export interface SessionDetails {
  totalLaps: number;
  drivers: SessionDriver[];
  teamPace: Record<string, number>;
}

const EMPTY_SESSION: SessionDetails = { totalLaps: 0, drivers: [], teamPace: {} };

/**
 * Stand-in for the future `GET /api/schedule?year=` backend call. Once the
 * FastAPI service exists, only this function's body changes (JSON import ->
 * fetch); every caller stays the same.
 */
export async function getSchedule(year: number): Promise<ScheduleEvent[]> {
  const schedule = scheduleData as Record<string, ScheduleEvent[]>;
  return schedule[String(year)] ?? [];
}

/**
 * Stand-in for the future `GET /api/session?year=&event=` backend call.
 */
export async function getSessionDetails(
  year: number,
  eventName: string
): Promise<SessionDetails> {
  const sessions = sessionData as Record<string, SessionDetails>;
  return sessions[`${year}:${eventName}`] ?? EMPTY_SESSION;
}
