"use client";

import { useEffect, useMemo, useState } from "react";
import { getSchedule, getSessionDetails, ScheduleEvent, SessionDetails } from "@/lib/api";
import { TIRE_COMPOUND_NAMES, TIRE_COMPOUNDS, TireCompoundName } from "@/lib/constants";
import { createCar } from "@/lib/simulation/car";
import { createDriver } from "@/lib/simulation/driver";
import { createStrategy } from "@/lib/simulation/strategy";
import { LapResult, runSimulation } from "@/lib/simulation/simulationEngine";
import RaceSettingsSidebar from "@/components/RaceSettingsSidebar";
import ResultsPanel from "@/components/ResultsPanel";

const EARLIEST_SUPPORTED_YEAR = 2018;
const DEFAULT_YEAR = 2024;

const EMPTY_SESSION: SessionDetails = { totalLaps: 0, drivers: [], teamPace: {} };

function parsePitStopLaps(pitStopsInput: string): number[] {
  return pitStopsInput
    .split(",")
    .map((lap) => lap.trim())
    .filter((lap) => lap.length > 0)
    .map((lap) => parseInt(lap, 10))
    .filter((lap) => !Number.isNaN(lap));
}

export default function StrategyTool() {
  const currentYear = new Date().getFullYear();
  const years = useMemo(() => {
    const list: number[] = [];
    for (let y = currentYear; y >= EARLIEST_SUPPORTED_YEAR; y--) list.push(y);
    return list;
  }, [currentYear]);

  const [selectedYear, setSelectedYear] = useState(DEFAULT_YEAR);
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState("");
  const [sessionDetails, setSessionDetails] = useState<SessionDetails>(EMPTY_SESSION);

  const [baseLapTime, setBaseLapTime] = useState(90.0);
  const [pitStopLoss, setPitStopLoss] = useState(21.0);

  const [selectedDriverAbbr, setSelectedDriverAbbr] = useState("");
  const [pitStopsInput, setPitStopsInput] = useState("28");
  const [tireSequence, setTireSequence] = useState<TireCompoundName[]>(["MEDIUM", "HARD"]);

  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<LapResult[] | null>(null);

  // Load the event list for the selected season.
  useEffect(() => {
    let cancelled = false;
    getSchedule(selectedYear).then((schedule) => {
      if (cancelled) return;
      setEvents(schedule);
      setSelectedEvent(schedule[0]?.eventName ?? "");
    });
    return () => {
      cancelled = true;
    };
  }, [selectedYear]);

  // Load session details (drivers, total laps, team pace) for the selected event.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const details = selectedEvent
        ? await getSessionDetails(selectedYear, selectedEvent)
        : EMPTY_SESSION;
      if (cancelled) return;
      setSessionDetails(details);
      setSelectedDriverAbbr(details.drivers[0]?.abbr ?? "");
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedYear, selectedEvent]);

  const pitStopLaps = useMemo(() => parsePitStopLaps(pitStopsInput), [pitStopsInput]);

  // Keep the tire sequence in sync with however many stints the pit stop
  // input implies, defaulting new stints to HARD and the opener to MEDIUM
  // (mirrors the Streamlit selectbox defaults at app.py:333-335). Done in the
  // input's own handler (not an effect) since it's derived from an event, not
  // an external data source.
  const syncTireSequence = (laps: number[]) => {
    const numStints = laps.length + 1;
    setTireSequence((prev) => {
      if (prev.length === numStints) return prev;
      const next = [...prev];
      while (next.length < numStints) next.push("HARD");
      next.length = numStints;
      if (next.length > 0 && !next[0]) next[0] = "MEDIUM";
      return next;
    });
  };

  const handlePitStopsInputChange = (value: string) => {
    setPitStopsInput(value);
    syncTireSequence(parsePitStopLaps(value));
  };

  const handleTireChange = (index: number, value: TireCompoundName) => {
    setTireSequence((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const driverOptions = sessionDetails.drivers.map((d) => ({
    value: d.abbr,
    label: `${d.fullName} (${d.abbr})`,
  }));

  const handleSimulate = () => {
    setError(null);
    setResults(null);

    if (tireSequence.length !== pitStopLaps.length + 1) {
      setError("The number of tire choices must match the number of stints (number of pit stops + 1).");
      return;
    }

    const driverDetails = sessionDetails.drivers.find((d) => d.abbr === selectedDriverAbbr);
    const driverName = driverDetails?.abbr ?? "DRIVER";
    const teamName = driverDetails?.teamName ?? "TEAM";
    const paceDelta = sessionDetails.teamPace[teamName] ?? 0.0;

    const strategy = createStrategy(pitStopLaps, tireSequence, pitStopLoss);
    const car = createCar(baseLapTime, 0.05, paceDelta);
    const driver = createDriver(driverName);

    const laps = runSimulation(sessionDetails.totalLaps, car, driver, strategy, TIRE_COMPOUNDS);
    setResults(laps);
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-8 lg:flex-row">
      <RaceSettingsSidebar
        years={years}
        selectedYear={selectedYear}
        onYearChange={setSelectedYear}
        events={events}
        selectedEvent={selectedEvent}
        onEventChange={setSelectedEvent}
        baseLapTime={baseLapTime}
        onBaseLapTimeChange={setBaseLapTime}
        pitStopLoss={pitStopLoss}
        onPitStopLossChange={setPitStopLoss}
      />

      <main className="flex-1">
        <h1 className="text-3xl font-bold">F1 Race Engineer Strategy Tool</h1>

        {events.length === 0 && (
          <p className="mt-4 text-sm text-amber-400">No past races found in {selectedYear} to analyze.</p>
        )}

        {events.length > 0 && sessionDetails.drivers.length === 0 && (
          <p className="mt-4 text-sm text-red-400">
            No driver data could be loaded for {selectedEvent} {selectedYear}. Please select another event.
          </p>
        )}

        {sessionDetails.drivers.length > 0 && (
          <div className="mt-6 flex flex-col gap-6">
            <h2 className="text-xl font-semibold">Define Your Strategy</h2>

            <label className="flex flex-col gap-1 text-sm">
              Select Driver
              <select
                className="max-w-sm rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5"
                value={selectedDriverAbbr}
                onChange={(e) => setSelectedDriverAbbr(e.target.value)}
              >
                {driverOptions.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-sm">
              Pit Stop Laps (comma-separated, e.g., 15, 40)
              <input
                type="text"
                className="max-w-sm rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5"
                value={pitStopsInput}
                onChange={(e) => handlePitStopsInputChange(e.target.value)}
              />
            </label>

            <div>
              <h3 className="mb-2 text-lg font-medium">Tire Stint Plan</h3>
              <div className="flex flex-wrap gap-4">
                {tireSequence.map((tire, i) => (
                  <label key={i} className="flex flex-col gap-1 text-sm">
                    {i === 0 ? "Start Tire" : `Stint ${i + 1} Tire`}
                    <select
                      className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5"
                      value={tire}
                      onChange={(e) => handleTireChange(i, e.target.value as TireCompoundName)}
                    >
                      {TIRE_COMPOUND_NAMES.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </div>

            <button
              onClick={handleSimulate}
              className="w-fit rounded-full border-2 border-f1-red bg-transparent px-6 py-2.5 font-bold uppercase text-f1-red transition-all duration-300 ease-in-out hover:scale-105 hover:bg-f1-red hover:text-white hover:shadow-[0_0_20px_#E10600]"
            >
              Simulate Race Strategy
            </button>

            {error && <p className="text-sm text-red-400">{error}</p>}

            {!results && !error && (
              <p className="text-sm text-zinc-500">
                Configure your strategy above and click &apos;Simulate Race Strategy&apos;.
              </p>
            )}

            {results && (
              <ResultsPanel
                results={results}
                driverName={selectedDriverAbbr}
                eventName={selectedEvent}
                teamName={sessionDetails.drivers.find((d) => d.abbr === selectedDriverAbbr)?.teamName ?? "TEAM"}
                paceDelta={
                  sessionDetails.teamPace[
                    sessionDetails.drivers.find((d) => d.abbr === selectedDriverAbbr)?.teamName ?? ""
                  ] ?? 0
                }
              />
            )}
          </div>
        )}
      </main>
    </div>
  );
}
