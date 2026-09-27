"use client";

import { useEffect, useState } from "react";
import IntroScreen from "@/components/IntroScreen";
import TelemetryDashboard from "@/components/telemetry/TelemetryDashboard";

type Phase = "intro" | "flight" | "fade" | "done";

export default function Home() {
  const [phase, setPhase] = useState<Phase>("intro");
  const [mounted, setMounted] = useState(false);
  const covered = phase === "intro";

  useEffect(() => {
    // Check if intro was already shown in this session
    const introShown = sessionStorage.getItem("introShown");
    if (introShown) {
      setPhase("done");
    }
    setMounted(true);
  }, []);

  const handleDone = () => {
    setPhase("done");
    sessionStorage.setItem("introShown", "true");
  };

  // Don't render until we've checked sessionStorage
  if (!mounted) return null;

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
        <IntroScreen onLeave={(flight) => setPhase(flight ? "flight" : "fade")} onDone={handleDone} />
      )}
    </>
  );
}
