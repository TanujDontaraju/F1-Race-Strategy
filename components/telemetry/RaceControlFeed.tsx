"use client";

import { ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";
import { lastIndexAtOrBefore } from "@/lib/telemetry/buffer";
import { parseDate } from "@/lib/telemetry/format";
import { useTelemetryStore } from "@/lib/telemetry/store";
import { RaceControlRow } from "@/lib/telemetry/types";

const HISTORY = 40;

function flagColour(row: RaceControlRow): string {
  switch (row.flag) {
    case "RED":
      return "#ff453a";
    case "YELLOW":
    case "DOUBLE YELLOW":
      return "#ffd60a";
    case "GREEN":
    case "CLEAR":
      return "#30d158";
    case "BLUE":
      return "#0a84ff";
    case "CHEQUERED":
    case "BLACK AND WHITE":
      return "#f5f5f5";
  }
  return row.category === "SafetyCar" ? "#ffd60a" : "rgba(255, 255, 255, 0.35)";
}

function Message({ row, compact = false }: { row: RaceControlRow; compact?: boolean }) {
  return (
    <span className="flex min-w-0 items-center gap-2 text-xs">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: flagColour(row) }} aria-hidden />
      {row.lap_number != null && <span className="shrink-0 font-semibold tabular-nums text-white/45">L{row.lap_number}</span>}
      <span className={`${compact ? "truncate" : ""} font-medium text-white/85`}>{row.message}</span>
    </span>
  );
}

/** Race control messages up to the playback moment: the latest in a strip, the history on demand. */
export default function RaceControlFeed() {
  const raceControl = useTelemetryStore((s) => s.raceControl);
  const time = useTelemetryStore((s) => s.displayCursor);
  const [open, setOpen] = useState(false);

  const times = useMemo(() => raceControl.map((r) => parseDate(r.date)), [raceControl]);
  const shown = useMemo(() => {
    const last = lastIndexAtOrBefore(times, time);
    return raceControl.slice(Math.max(0, last + 1 - HISTORY), last + 1).reverse();
  }, [raceControl, times, time]);
  const latest = shown[0];

  return (
    <section aria-label="Race control" className="mx-3 mb-3 rounded-[18px] bg-black/25">
      <button
        type="button"
        aria-expanded={open}
        disabled={!latest}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 rounded-[18px] px-3.5 py-2.5 text-left transition-colors duration-150 hover:bg-white/[0.04] disabled:hover:bg-transparent"
      >
        <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/45">Race control</span>
        {latest ? <Message row={latest} compact /> : <span className="text-xs text-white/40">No messages yet</span>}
        <ChevronDown
          size={14}
          aria-hidden
          className={`ml-auto shrink-0 text-white/50 transition-transform duration-200 ease-out ${open ? "rotate-180" : ""}`}
        />
      </button>
      {/* Animating grid rows from 0fr to 1fr grows the list to its natural height. */}
      <div
        className="grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.2,0.9,0.3,1)]"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <ol className="min-h-0 overflow-y-auto" style={{ maxHeight: "11rem" }} aria-label="Recent messages">
          {shown.map((row, i) => (
            <li key={`${row.date}-${i}`} className="border-t border-white/[0.06] px-3.5 py-1.5">
              <Message row={row} />
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
