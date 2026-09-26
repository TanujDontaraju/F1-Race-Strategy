"use client";

import { useEffect } from "react";
import DriverDetailPanel from "@/components/telemetry/DriverDetailPanel";
import LeaderboardPanel from "@/components/telemetry/LeaderboardPanel";
import PlaybackControls from "@/components/telemetry/PlaybackControls";
import SessionPicker from "@/components/telemetry/SessionPicker";
import TrackMap from "@/components/telemetry/TrackMap";
import { useTelemetryStore } from "@/lib/telemetry/store";
import { usePlaybackEngine } from "@/lib/telemetry/usePlaybackEngine";

export default function TelemetryDashboard() {
  usePlaybackEngine();

  useEffect(() => {
    const { loadYear, year } = useTelemetryStore.getState();
    void loadYear(year);
  }, []);

  return (
    <div className="pitwall-ambient flex min-h-screen flex-1 flex-col lg:h-screen lg:min-h-0 lg:overflow-hidden">
      <div className="mx-auto flex w-full max-w-[1680px] flex-1 flex-col gap-4 p-4 lg:min-h-0 lg:p-6">
        {/* Raised so the session dropdowns open over the panels below. */}
        <header className="glass-chrome relative z-20 flex flex-wrap items-center justify-between gap-3 rounded-[28px] px-5 py-2.5 sm:rounded-full">
          <div className="flex items-baseline gap-3">
            <span className="h-2 w-2 self-center rounded-full bg-f1-red" aria-hidden />
            <h1 className="text-sm font-bold uppercase tracking-[0.16em]">Pit Wall</h1>
            <span className="hidden text-xs font-medium text-white/50 sm:inline">Telemetry watcher</span>
          </div>
          <SessionPicker />
        </header>

        <main className="grid flex-1 gap-4 lg:min-h-0 lg:grid-cols-[minmax(250px,290px)_minmax(0,1fr)_minmax(280px,330px)]">
          <LeaderboardPanel />
          <TrackMap />
          <DriverDetailPanel />
        </main>

        <PlaybackControls />
      </div>
    </div>
  );
}
