import { Session } from "@/lib/telemetry/types";

export type ViewId = "pitwall" | "overview" | "laps" | "progression" | "strategy" | "pits" | "analysis";

export interface ViewOption {
  id: ViewId;
  label: string;
}

export type SessionKind = "race" | "qualifying" | "practice";

/** Sprints count as races and sprint qualifying as qualifying; testing days count as practice. */
export function sessionKind(session: Session | null): SessionKind {
  if (session?.session_type === "Race") return "race";
  if (session?.session_type === "Qualifying") return "qualifying";
  return "practice";
}

const PIT_WALL: ViewOption = { id: "pitwall", label: "Pit Wall" };
const LAP_ANALYSIS: ViewOption = { id: "laps", label: "Lap Analysis" };

export function viewsFor(session: Session | null): ViewOption[] {
  switch (sessionKind(session)) {
    case "race":
      return [
        PIT_WALL,
        { id: "overview", label: "Overview" },
        LAP_ANALYSIS,
        { id: "progression", label: "Progression" },
        { id: "strategy", label: "Strategy" },
        { id: "pits", label: "Pit Stops" },
      ];
    case "qualifying":
      return [PIT_WALL, { id: "overview", label: "Results" }, LAP_ANALYSIS, { id: "analysis", label: "Analysis" }];
    default:
      return [PIT_WALL, { id: "overview", label: "Overview" }, LAP_ANALYSIS, { id: "analysis", label: "Analysis" }];
  }
}

const SHORT_NAMES: Record<string, string> = {
  "Practice 1": "FP1",
  "Practice 2": "FP2",
  "Practice 3": "FP3",
  Qualifying: "Quali",
  "Sprint Qualifying": "SQ",
  "Sprint Shootout": "SQ",
  Sprint: "Sprint",
  Race: "Race",
};

/** Chip label for the session switcher. */
export function sessionShortName(session: Pick<Session, "session_name">): string {
  return SHORT_NAMES[session.session_name] ?? session.session_name;
}
