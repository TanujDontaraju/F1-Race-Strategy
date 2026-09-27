"use client";

import LapAnalysis from "@/components/analysis/LapAnalysis";
import PitStops from "@/components/analysis/PitStops";
import PracticeAnalysis from "@/components/analysis/PracticeAnalysis";
import PracticeOverview from "@/components/analysis/PracticeOverview";
import Progression from "@/components/analysis/Progression";
import QualifyingAnalysis from "@/components/analysis/QualifyingAnalysis";
import QualifyingResults from "@/components/analysis/QualifyingResults";
import RaceOverview from "@/components/analysis/RaceOverview";
import Strategy from "@/components/analysis/Strategy";
import GlassPanel from "@/components/telemetry/GlassPanel";
import { OFFLINE_MESSAGE, useTelemetryStore } from "@/lib/telemetry/store";
import { sessionKind, ViewId } from "@/lib/telemetry/views";

/** Everything except the Pit Wall: whole-session results and charts for the selected session. */
export default function AnalysisView({ view }: { view: Exclude<ViewId, "pitwall"> }) {
  const status = useTelemetryStore((s) => s.status);
  const session = useTelemetryStore((s) => s.session);

  if (status !== "ready") {
    return (
      <GlassPanel className="flex min-h-[320px] items-center justify-center p-8 text-center text-sm text-white/55">
        {status === "loading" && "Loading session…"}
        {status === "unavailable" && "No timing data has been published for this session yet."}
        {status === "error" && "Couldn't load this session."}
        {status === "offline" && OFFLINE_MESSAGE}
      </GlassPanel>
    );
  }

  const kind = sessionKind(session);
  switch (view) {
    case "overview":
      return kind === "race" ? <RaceOverview /> : kind === "qualifying" ? <QualifyingResults /> : <PracticeOverview />;
    case "laps":
      return <LapAnalysis />;
    case "progression":
      return <Progression />;
    case "strategy":
      return <Strategy />;
    case "pits":
      return <PitStops />;
    case "analysis":
      return kind === "qualifying" ? <QualifyingAnalysis /> : <PracticeAnalysis />;
  }
}
