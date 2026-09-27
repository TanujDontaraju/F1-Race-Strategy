"use client";

import Link from "next/link";
import { useEffect } from "react";
import AnalysisView from "@/components/analysis/AnalysisView";
import ComparePicker from "@/components/analysis/ComparePicker";
import ViewTabs from "@/components/analysis/ViewTabs";
import DriverDetailPanel from "@/components/telemetry/DriverDetailPanel";
import LeaderboardPanel from "@/components/telemetry/LeaderboardPanel";
import PlaybackControls from "@/components/telemetry/PlaybackControls";
import RaceAlerts from "@/components/telemetry/RaceAlerts";
import SessionPicker from "@/components/telemetry/SessionPicker";
import TrackMap from "@/components/telemetry/TrackMap";
import { LastRace, WeekendSchedule } from "@/components/telemetry/UpcomingWeekend";
import { serverReachable } from "@/lib/telemetry/api";
import { useTelemetryStore } from "@/lib/telemetry/store";
import { usePlaybackEngine } from "@/lib/telemetry/usePlaybackEngine";

const RECONNECT_MS = 3000;
// The server refreshes F1's index every five minutes, so checking more often gains little.
const UPCOMING_CHECK_MS = 2 * 60 * 1000;

/** `active` is false while the dashboard loads behind the intro, so playback waits for you to enter. */
export default function TelemetryDashboard({ active = true }: { active?: boolean }) {
  usePlaybackEngine(active);
  const view = useTelemetryStore((s) => s.view);
  const status = useTelemetryStore((s) => s.status);
  const isPitWall = view === "pitwall";
  const upcoming = status === "upcoming";

  useEffect(() => {
    void useTelemetryStore.getState().loadCurrent();
  }, []);

  // Before the race week's first session, look for it now and then and switch over once it's live.
  useEffect(() => {
    if (!upcoming) return;
    const timer = setInterval(() => void useTelemetryStore.getState().checkUpcoming(), UPCOMING_CHECK_MS);
    return () => clearInterval(timer);
  }, [upcoming]);

  // While the telemetry server is down, check for it quietly and pick up where loading stopped.
  useEffect(() => {
    if (status !== "offline") return;
    const timer = setInterval(async () => {
      if (await serverReachable()) void useTelemetryStore.getState().retry();
    }, RECONNECT_MS);
    return () => clearInterval(timer);
  }, [status]);

  return (
    // The Pit Wall fills the screen on desktop; the analysis views scroll like a page.
    <div
      className={`pitwall-ambient flex min-h-screen flex-1 flex-col ${
        isPitWall ? "lg:h-screen lg:min-h-0 lg:overflow-hidden" : ""
      }`}
    >
      <div className="mx-auto flex w-full max-w-[1680px] flex-1 flex-col gap-4 p-4 lg:min-h-0 lg:p-6">
        {/* Raised so the session dropdowns open over the panels below. */}
        <header className="glass-chrome relative z-20 flex flex-wrap items-center justify-between gap-3 rounded-[28px] px-5 py-2.5">
          <div className="flex items-baseline gap-6">
            <Link href="/" className="text-sm font-bold uppercase tracking-[0.16em] transition-opacity hover:opacity-70">
              Pit Wall
            </Link>
            <Link href="/news" className="text-sm font-bold uppercase tracking-[0.16em] transition-opacity hover:opacity-70">
              News
            </Link>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SessionPicker />
            {!isPitWall && <ComparePicker />}
          </div>
        </header>

        {!upcoming && <ViewTabs />}

        {upcoming ? (
          <main className="grid flex-1 gap-4 lg:min-h-0 lg:grid-cols-[minmax(250px,290px)_minmax(0,1fr)_minmax(280px,330px)]">
            <WeekendSchedule />
            <TrackMap />
            <LastRace />
          </main>
        ) : isPitWall ? (
          <>
            <main className="grid flex-1 gap-4 lg:min-h-0 lg:grid-cols-[minmax(250px,290px)_minmax(0,1fr)_minmax(280px,330px)]">
              <LeaderboardPanel />
              <TrackMap />
              <DriverDetailPanel />
            </main>
            <PlaybackControls />
            <RaceAlerts />
          </>
        ) : (
          <main className="flex flex-col gap-4">
            <AnalysisView view={view} />
          </main>
        )}
      </div>
    </div>
  );
}
