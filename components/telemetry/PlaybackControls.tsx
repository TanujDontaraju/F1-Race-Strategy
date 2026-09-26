"use client";

import { Pause, Play, RotateCcw } from "lucide-react";
import { CSSProperties } from "react";
import SegmentedControl from "@/components/telemetry/SegmentedControl";
import { formatClock, formatDuration } from "@/lib/telemetry/format";
import { PLAYBACK_SPEEDS, useTelemetryStore } from "@/lib/telemetry/store";

export default function PlaybackControls() {
  const replay = useTelemetryStore((s) => s.replay);
  const status = useTelemetryStore((s) => s.status);
  const time = useTelemetryStore((s) => s.displayCursor);
  const isPlaying = useTelemetryStore((s) => s.isPlaying);
  const isBuffering = useTelemetryStore((s) => s.isBuffering);
  const speed = useTelemetryStore((s) => s.speed);
  const togglePlay = useTelemetryStore((s) => s.togglePlay);
  const setSpeed = useTelemetryStore((s) => s.setSpeed);
  const seek = useTelemetryStore((s) => s.seek);

  const ready = status === "ready" && replay != null;
  const start = replay?.start ?? 0;
  const end = replay?.end ?? 1;
  const progress = ready ? ((time - start) / (end - start)) * 100 : 0;
  const ended = ready && !isPlaying && time >= end;

  return (
    <div className="glass-chrome flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[28px] px-3 py-2 sm:flex-nowrap sm:rounded-full">
      <button
        type="button"
        onClick={togglePlay}
        disabled={!ready}
        aria-label={isPlaying ? "Pause" : ended ? "Replay from start" : "Play"}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-black transition-transform duration-100 ease-out active:scale-95 disabled:opacity-30"
      >
        {isPlaying ? (
          <Pause size={20} fill="currentColor" />
        ) : ended ? (
          <RotateCcw size={20} strokeWidth={2.5} />
        ) : (
          <Play size={20} fill="currentColor" className="translate-x-px" />
        )}
      </button>

      <span className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-bold tracking-[0.12em] text-white/80">
        REPLAY
      </span>

      <span className="w-20 text-xs font-medium tabular-nums text-white/70">{ready ? `${formatClock(time)} UTC` : "--:--:--"}</span>

      <input
        type="range"
        className="scrubber order-last w-full sm:order-none sm:w-auto sm:flex-1"
        min={start}
        max={end}
        step={100}
        value={ready ? time : start}
        disabled={!ready}
        onChange={(e) => seek(Number(e.target.value))}
        aria-label="Playback position"
        aria-valuetext={ready ? `${formatDuration(time - start)} of ${formatDuration(end - start)}` : undefined}
        style={{ "--progress": `${progress}%` } as CSSProperties}
      />

      <span className="text-xs font-medium tabular-nums text-white/60">
        {isBuffering ? "Buffering…" : ready ? `${formatDuration(time - start)} / ${formatDuration(end - start)}` : ""}
      </span>

      <SegmentedControl
        kind="radio"
        label="Playback speed"
        options={PLAYBACK_SPEEDS}
        value={speed}
        onChange={setSpeed}
        getLabel={(s) => `${s}×`}
        className="ml-auto sm:ml-0"
      />
    </div>
  );
}
