"use client";

import {
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from "chart.js";
import { Line } from "react-chartjs-2";
import { LapResult } from "@/lib/simulation/simulationEngine";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

export default function ResultsPanel({
  results,
  driverName,
  eventName,
  teamName,
  paceDelta,
}: {
  results: LapResult[];
  driverName: string;
  eventName: string;
  teamName: string;
  paceDelta: number;
}) {
  const totalRaceTimeSeconds = results.reduce((sum, lap) => sum + lap.lapTime, 0);
  const minutes = Math.floor(totalRaceTimeSeconds / 60);
  const seconds = totalRaceTimeSeconds % 60;

  const chartData = {
    labels: results.map((lap) => lap.lapNumber),
    datasets: [
      {
        label: "Lap Time (s)",
        data: results.map((lap) => lap.lapTime),
        borderColor: "#E10600",
        backgroundColor: "rgba(225, 6, 0, 0.2)",
        pointRadius: 2,
        tension: 0.1,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: { labels: { color: "#f5f5f5" } },
    },
    scales: {
      x: {
        title: { display: true, text: "Lap", color: "#f5f5f5" },
        ticks: { color: "#a1a1aa" },
        grid: { color: "#27272a" },
      },
      y: {
        title: { display: true, text: "Lap Time (s)", color: "#f5f5f5" },
        ticks: { color: "#a1a1aa" },
        grid: { color: "#27272a" },
      },
    },
  };

  return (
    <div className="mt-8 flex flex-col gap-6">
      <h2 className="text-2xl font-semibold">
        Simulated Race Results for {driverName} at {eventName}
      </h2>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
          <p className="text-sm text-zinc-400">Total Race Time</p>
          <p className="text-2xl font-semibold">
            {minutes}m {seconds.toFixed(2)}s
          </p>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
          <p className="text-sm text-zinc-400">{teamName} Pace Delta</p>
          <p className="text-2xl font-semibold">+{paceDelta.toFixed(3)}s / lap</p>
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-lg font-medium">Lap Time Chart</h3>
        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
          <Line data={chartData} options={chartOptions} />
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-lg font-medium">Race Data</h3>
        <div className="max-h-96 overflow-auto rounded-lg border border-zinc-800">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-zinc-900">
              <tr>
                <th className="px-3 py-2">Lap</th>
                <th className="px-3 py-2">Lap Time (s)</th>
                <th className="px-3 py-2">Tire Age</th>
                <th className="px-3 py-2">Pit Stop</th>
                <th className="px-3 py-2">Tire</th>
              </tr>
            </thead>
            <tbody>
              {results.map((lap) => (
                <tr key={lap.lapNumber} className="border-t border-zinc-800">
                  <td className="px-3 py-1.5">{lap.lapNumber}</td>
                  <td className="px-3 py-1.5">{lap.lapTime.toFixed(3)}</td>
                  <td className="px-3 py-1.5">{lap.tireAge}</td>
                  <td className="px-3 py-1.5">{lap.isPitStop ? "Yes" : ""}</td>
                  <td className="px-3 py-1.5">{lap.tireCompound}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
