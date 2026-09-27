"use client";

import { useState } from "react";
import IntroScreen from "@/components/IntroScreen";
import TelemetryDashboard from "@/components/telemetry/TelemetryDashboard";

type Phase = "intro" | "flight" | "fade" | "done";

// Module state outlives client-side navigation (Pit Wall ↔ News) but not a page
// load or refresh, so the intro plays once per visit.
let introPlayed = false;

export default function Home() {
  const [phase, setPhase] = useState<Phase>(() => (introPlayed ? "done" : "intro"));
  const covered = phase === "intro";

  return (
    <>
      {/* The dashboard loads behind the intro, so it's ready the moment you enter. */}
      <div
        inert={covered}
        data-track-hidden={phase === "flight" ? "" : undefined}
        className={covered ? "flex h-screen flex-col overflow-hidden" : "flex flex-1 flex-col"}
      >
        <TelemetryDashboard active={!covered} />
      </div>
      {phase !== "done" && (
        <IntroScreen
          onLeave={(flight) => {
            introPlayed = true;
            setPhase(flight ? "flight" : "fade");
          }}
          onDone={() => setPhase("done")}
        />
      )}
    </>
  );
}
