"use client";

import { useEffect } from "react";
import { useTelemetryStore } from "@/lib/telemetry/store";

/** Drives the playback clock off the display refresh. Mount once; the clock holds while `active` is false. */
export function usePlaybackEngine(active = true) {
  useEffect(() => {
    if (!active) return;
    let frame = 0;
    let last = performance.now();
    const loop = (now: number) => {
      useTelemetryStore.getState().advance(now - last, now);
      last = now;
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [active]);
}
