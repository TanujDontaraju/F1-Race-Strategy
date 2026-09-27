"use client";

import { useEffect, useState } from "react";
import { getLapTelemetry } from "@/lib/telemetry/api";
import { LapTelemetry } from "@/lib/telemetry/types";

// Laps never change once recorded, so each is fetched once per page load.
const cache = new Map<string, Promise<LapTelemetry | null>>();

function load(sessionKey: number, driver: number, lap: number) {
  const key = `${sessionKey}-${driver}-${lap}`;
  let request = cache.get(key);
  if (!request) {
    request = getLapTelemetry(sessionKey, driver, lap).catch(() => {
      cache.delete(key);
      return null;
    });
    cache.set(key, request);
  }
  return request;
}

export interface LapRequest {
  driver: number;
  lap: number;
}

export interface LoadedLap extends LapRequest {
  telemetry: LapTelemetry;
}

/**
 * Telemetry for the requested laps that have it. While a new set loads, the
 * previous one stays up with `loading` set, so the charts dim rather than
 * flash empty; each entry says which driver and lap it is.
 */
export function useLapTelemetry(sessionKey: number | null, requests: LapRequest[]) {
  const id = `${sessionKey}:${requests.map((r) => `${r.driver}-${r.lap}`).join(",")}`;
  const [state, setState] = useState<{ id: string; laps: LoadedLap[] }>({ id: "", laps: [] });

  useEffect(() => {
    if (sessionKey == null) return;
    let cancelled = false;
    void Promise.all(requests.map((r) => load(sessionKey, r.driver, r.lap))).then((results) => {
      if (cancelled) return;
      const laps = requests.flatMap((r, i) => (results[i] ? [{ ...r, telemetry: results[i] }] : []));
      setState({ id, laps });
    });
    return () => {
      cancelled = true;
    };
    // `id` captures the requests' contents.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey, id]);

  return { laps: state.laps, loading: state.id !== id, ready: state.id !== "" };
}
