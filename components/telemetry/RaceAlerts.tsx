"use client";

import { Car, Flag, Siren } from "lucide-react";
import { useEffect, useMemo } from "react";
import { toast } from "sonner";
import { AlertKind, buildAlerts, RaceAlert } from "@/lib/telemetry/alerts";
import { useTelemetryStore } from "@/lib/telemetry/store";

// The most the replay clock moves in one frame at top speed, plus slack. A bigger jump is a seek:
// scrubbing past a retirement shouldn't announce it.
const MAX_PLAYBACK_STEP_MS = 2_000;

const ICONS: Record<AlertKind, typeof Flag> = {
  retirement: Car,
  "safety-car": Siren,
  vsc: Siren,
  "red-flag": Flag,
  chequered: Flag,
};

function AlertToast({ alert }: { alert: RaceAlert }) {
  const Icon = ICONS[alert.kind];
  return (
    <div className="race-alert flex w-[min(340px,calc(100vw-32px))] items-center gap-3 rounded-[20px] py-3 pl-3 pr-4">
      <span className="h-9 w-1 shrink-0 rounded-full" style={{ background: alert.accent }} aria-hidden />
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10"
        style={{ color: alert.accent }}
        aria-hidden
      >
        <Icon size={16} strokeWidth={2.25} />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold tracking-tight text-white">{alert.title}</p>
        <p className="truncate text-xs text-white/60">{alert.detail}</p>
      </div>
    </div>
  );
}

/** Pops up retirements, safety cars, red flags and the chequered flag as the replay passes them. */
export default function RaceAlerts() {
  const drivers = useTelemetryStore((s) => s.drivers);
  const retirements = useTelemetryStore((s) => s.retirements);
  const trackStatus = useTelemetryStore((s) => s.trackStatus);
  const sessionStatus = useTelemetryStore((s) => s.sessionStatus);
  const raceControl = useTelemetryStore((s) => s.raceControl);
  const session = useTelemetryStore((s) => s.session);

  const alerts = useMemo(
    () => buildAlerts(drivers, retirements, trackStatus, sessionStatus, raceControl),
    [drivers, retirements, trackStatus, sessionStatus, raceControl]
  );

  useEffect(() => {
    if (alerts.length === 0) return;
    const sessionKey = session?.session_key;
    return useTelemetryStore.subscribe((state, prev) => {
      const step = state.cursor - prev.cursor;
      if (!state.isPlaying || step <= 0 || step > MAX_PLAYBACK_STEP_MS) return;
      for (const alert of alerts) {
        if (alert.time > prev.cursor && alert.time <= state.cursor) {
          // A stable id means a repeat (e.g. React's dev double-mount) updates rather than duplicates.
          toast.custom(() => <AlertToast alert={alert} />, {
            id: `${sessionKey}-${alert.id}`,
            duration: alert.kind === "red-flag" || alert.kind === "chequered" ? 7000 : 5000,
          });
        }
      }
    });
  }, [alerts, session]);

  return null;
}
