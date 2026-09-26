"use client";

import { useState } from "react";
import IntroScreen from "@/components/IntroScreen";
import TelemetryDashboard from "@/components/telemetry/TelemetryDashboard";

export default function Home() {
  const [introComplete, setIntroComplete] = useState(false);

  if (!introComplete) {
    return <IntroScreen onEnter={() => setIntroComplete(true)} />;
  }

  return (
    <div
      className="flex flex-1 flex-col"
      style={{ animation: "cinematic-fade-in 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards" }}
    >
      <TelemetryDashboard />
    </div>
  );
}
