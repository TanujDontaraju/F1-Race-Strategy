import { Driver, GapValue } from "@/lib/telemetry/types";

export function teamColour(driver: Driver | undefined): string {
  return driver?.team_colour ? `#${driver.team_colour}` : "#8e8e93";
}

/** OpenF1 returns the 93px "1col" headshot; "4col" is the same image at 432px. */
export function largeHeadshot(url: string): string {
  return url.replace("/1col/", "/4col/");
}

/** OpenF1 timestamps carry microseconds; trim to milliseconds so every engine parses them. */
export function parseDate(iso: string): number {
  return Date.parse(iso.replace(/(\.\d{3})\d+/, "$1"));
}

export function formatLapTime(seconds: number | null | undefined): string {
  if (seconds == null) return "—";
  const minutes = Math.floor(seconds / 60);
  const rest = seconds - minutes * 60;
  const secs = rest.toFixed(3).padStart(6, "0");
  return minutes > 0 ? `${minutes}:${secs}` : rest.toFixed(3);
}

export function formatGap(value: GapValue): string {
  if (value == null) return "—";
  if (typeof value === "string") return value;
  return `+${value.toFixed(3)}`;
}

export function formatClock(ms: number): string {
  return new Date(ms).toISOString().slice(11, 19);
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
