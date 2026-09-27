import { parseDate } from "@/lib/telemetry/format";
import { Driver, RaceControlRow, RetirementRow, SessionStatusRow, TrackStatusRow } from "@/lib/telemetry/types";

export type AlertKind = "retirement" | "safety-car" | "vsc" | "red-flag" | "chequered";

export interface RaceAlert {
  id: string;
  time: number;
  kind: AlertKind;
  title: string;
  detail: string;
  /** Team colour for a retirement; otherwise the flag's colour. */
  accent: string;
}

const FLAG_COLOURS: Record<Exclude<AlertKind, "retirement">, string> = {
  "safety-car": "#ffd60a",
  vsc: "#ffd60a",
  "red-flag": "#ff453a",
  chequered: "#f5f5f5",
};

type StatusAlert = { kind: Exclude<AlertKind, "retirement">; title: string; detail: string };

// Track status changes worth interrupting for. Yellow flags come and go constantly and are left out.
function statusAlert(previous: string | null, status: string): StatusAlert | null {
  if (status === "SCDeployed") return { kind: "safety-car", title: "Safety car deployed", detail: "Field neutralised" };
  if (status === "VSCDeployed") return { kind: "vsc", title: "Virtual safety car", detail: "Delta times in force" };
  if (status === "VSCEnding") return { kind: "vsc", title: "VSC ending", detail: "Racing resumes shortly" };
  if (status === "Red") return { kind: "red-flag", title: "Red flag", detail: "Session suspended" };
  if (previous === "SCDeployed") return { kind: "safety-car", title: "Safety car in", detail: "Green flag, racing resumes" };
  return null;
}

function statusAt(trackStatus: TrackStatusRow[], time: number): string | null {
  let status: string | null = null;
  for (const row of trackStatus) {
    if (parseDate(row.date) > time) break;
    status = row.status;
  }
  return status;
}

/** Everything that pops up a notification during a replay, in time order. */
export function buildAlerts(
  drivers: Driver[],
  retirements: RetirementRow[],
  trackStatus: TrackStatusRow[],
  sessionStatus: SessionStatusRow[],
  raceControl: RaceControlRow[]
): RaceAlert[] {
  const alerts: RaceAlert[] = [];
  const byNumber = new Map(drivers.map((d) => [d.driver_number, d]));
  const push = (alert: StatusAlert, id: string, time: number) =>
    alerts.push({ ...alert, id, time, accent: FLAG_COLOURS[alert.kind] });

  for (const r of retirements) {
    const driver = byNumber.get(r.driver_number);
    alerts.push({
      id: `out-${r.driver_number}`,
      time: parseDate(r.date),
      kind: "retirement",
      title: `${driver?.name_acronym ?? r.driver_number} · Out`,
      detail: `${driver?.full_name ?? `Car ${r.driver_number}`} retired on lap ${r.lap_number}`,
      accent: driver?.team_colour ? `#${driver.team_colour}` : "#8e8e93",
    });
  }

  let previous: string | null = null;
  const redFlags: number[] = [];
  for (const row of trackStatus) {
    if (row.status === "Yellow" || row.status === previous) continue;
    const alert = statusAlert(previous, row.status);
    const time = parseDate(row.date);
    if (alert) push(alert, `status-${row.date}`, time);
    if (row.status === "Red") redFlags.push(time);
    previous = row.status;
  }

  // Under a red flag the track status clears long before the restart (marshals, recovery);
  // the session is back under way when its status next reads Started.
  for (const red of redFlags) {
    const restart = sessionStatus.find((s) => s.status === "Started" && parseDate(s.date) > red);
    if (!restart) continue;
    const time = parseDate(restart.date);
    const behindSafetyCar = statusAt(trackStatus, time) === "SCDeployed";
    push(
      { kind: "red-flag", title: "Session resumed", detail: behindSafetyCar ? "Restart behind the safety car" : "Back under way" },
      `resume-${restart.date}`,
      time
    );
  }

  const chequered = raceControl.find((r) => r.flag === "CHEQUERED");
  if (chequered) {
    push(
      {
        kind: "chequered",
        title: "Chequered flag",
        detail: chequered.lap_number ? `The leader finishes on lap ${chequered.lap_number}` : "Session over",
      },
      "chequered",
      parseDate(chequered.date)
    );
  }

  return alerts.sort((a, b) => a.time - b.time);
}
