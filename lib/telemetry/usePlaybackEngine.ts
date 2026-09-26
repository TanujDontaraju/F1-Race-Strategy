"use client";

import { useEffect } from "react";
import { useTelemetryStore } from "@/lib/telemetry/store";

/** Drives the playback clock off the display refresh. Mount once. */
export function usePlaybackEngine() {
  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    const loop = (now: number) => {
      useTelemetryStore.getState().advance(now - last, now);
      last = now;
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, []);
}
