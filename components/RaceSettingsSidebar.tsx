"use client";

import { ScheduleEvent } from "@/lib/api";

const EARLIEST_SUPPORTED_YEAR = 2018;

export default function RaceSettingsSidebar({
  years,
  selectedYear,
  onYearChange,
  events,
  selectedEvent,
  onEventChange,
  baseLapTime,
  onBaseLapTimeChange,
  pitStopLoss,
  onPitStopLossChange,
}: {
  years: number[];
  selectedYear: number;
  onYearChange: (year: number) => void;
  events: ScheduleEvent[];
  selectedEvent: string;
  onEventChange: (event: string) => void;
  baseLapTime: number;
  onBaseLapTimeChange: (value: number) => void;
  pitStopLoss: number;
  onPitStopLossChange: (value: number) => void;
}) {
  return (
    <aside className="flex w-full flex-col gap-4 border-b border-zinc-800 pb-6 lg:w-72 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-6">
      <h2 className="text-lg font-semibold">Race Settings</h2>

      <label className="flex flex-col gap-1 text-sm">
        Select Season
        <select
          className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5"
          value={selectedYear}
          onChange={(e) => onYearChange(Number(e.target.value))}
        >
          {years.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </label>
      <p className="text-xs text-zinc-500">
        Detailed timing data is only available from {EARLIEST_SUPPORTED_YEAR} onward, so earlier
        seasons aren&apos;t listed.
      </p>

      <label className="flex flex-col gap-1 text-sm">
        Select Grand Prix
        <select
          className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5"
          value={selectedEvent}
          onChange={(e) => onEventChange(e.target.value)}
          disabled={events.length === 0}
        >
          {events.length === 0 && <option value="">No past races found</option>}
          {events.map((event) => (
            <option key={event.eventName} value={event.eventName}>
              {event.eventName}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Fastest Car Pace (on Mediums, seconds)
        <input
          type="number"
          step="0.01"
          className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5"
          value={baseLapTime}
          onChange={(e) => onBaseLapTimeChange(Number(e.target.value))}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Pit Stop Time Loss (seconds)
        <input
          type="number"
          step="0.1"
          className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5"
          value={pitStopLoss}
          onChange={(e) => onPitStopLossChange(Number(e.target.value))}
        />
      </label>
    </aside>
  );
}
