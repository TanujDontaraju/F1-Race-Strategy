"use client";

import { useMemo } from "react";
import { XBand } from "@/components/charts/LineChart";
import { classification, driverLaps, LapPoint, neutralisedBands, neutralisedPeriods } from "@/lib/telemetry/analysis";
import { seriesStyles, SeriesStyle } from "@/lib/telemetry/seriesColours";
import { useTelemetryStore } from "@/lib/telemetry/store";

/** Colour and dash for each compared driver, in the order they were picked. */
export function useCompareStyles(): SeriesStyle[] {
  const compare = useTelemetryStore((s) => s.compare);
  const drivers = useTelemetryStore((s) => s.drivers);
  return useMemo(() => seriesStyles(compare, drivers), [compare, drivers]);
}

/** The compared drivers' races lap by lap, plus the laps run behind the safety car or under a red flag. */
export function useRaceLaps(styles: SeriesStyle[]) {
  const timeline = useTelemetryStore((s) => s.timeline);
  const drivers = useTelemetryStore((s) => s.drivers);
  const replay = useTelemetryStore((s) => s.replay);
  const pits = useTelemetryStore((s) => s.pits);
  const trackStatus = useTelemetryStore((s) => s.trackStatus);

  return useMemo(() => {
    const laps = new Map<number, LapPoint[]>();
    if (!timeline || !replay) return { laps, bands: [] as XBand[] };
    const periods = neutralisedPeriods(trackStatus);
    for (const { driver } of styles) laps.set(driver.driver_number, driverLaps(timeline, driver.driver_number, pits, periods));
    const winner = classification(timeline, drivers, replay.end)[0];
    const bands: XBand[] = winner
      ? neutralisedBands(timeline, trackStatus, winner.driver_number).map((b) => ({
          from: b.from - 0.5,
          to: b.to + 0.5,
          label: b.kind,
        }))
      : [];
    return { laps, bands };
  }, [timeline, drivers, replay, pits, trackStatus, styles]);
}
