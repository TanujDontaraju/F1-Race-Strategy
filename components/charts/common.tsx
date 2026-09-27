"use client";

import { ReactNode, RefObject, useLayoutEffect, useRef, useState } from "react";
import { CHART_SURFACE, DASH } from "@/lib/telemetry/seriesColours";

// Recessive chrome: hairline grid and axes one step off the surface, muted tick text.
export const GRID = "rgba(255,255,255,0.07)";
export const AXIS_TEXT = "rgba(255,255,255,0.45)";
export const SURFACE = CHART_SURFACE;
export const TICK_FONT = { fontSize: 11, fontVariantNumeric: "tabular-nums" } as const;

/** Tracks an element's width, for charts that draw at real pixel sizes. */
export function useElementWidth<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const observer = new ResizeObserver(() => setWidth(el.clientWidth));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

/** A short stroke in the series' colour and pattern: the key for lines. */
export function LineKey({ colour, dashed = false, width = 16 }: { colour: string; dashed?: boolean; width?: number }) {
  return (
    <svg width={width} height={4} aria-hidden className="shrink-0 overflow-visible">
      <line
        x1={0}
        x2={width}
        y1={2}
        y2={2}
        stroke={colour}
        strokeWidth={2}
        strokeLinecap="round"
        strokeDasharray={dashed ? DASH : undefined}
      />
    </svg>
  );
}

/** A filled swatch: the key for bars and areas. */
export function SwatchKey({ colour }: { colour: string }) {
  return <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: colour }} />;
}

export function Legend({ items }: { items: { key: string | number; label: string; swatch: ReactNode }[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1" aria-label="Legend">
      {items.map((item) => (
        <li key={item.key} className="flex items-center gap-2 text-xs font-semibold text-white/75">
          {item.swatch}
          {item.label}
        </li>
      ))}
    </ul>
  );
}

/**
 * Floating readout next to the pointer. `x` is the anchor within the chart; the
 * tooltip flips to the left of it near the right edge.
 */
export function Tooltip({
  x,
  y = 8,
  width,
  children,
}: {
  x: number;
  y?: number;
  width: number;
  children: ReactNode;
}) {
  const flip = x > width - 200;
  return (
    <div
      role="presentation"
      className="pointer-events-none absolute z-10 min-w-36 rounded-2xl border border-white/10 bg-[rgba(26,26,32,0.97)] px-3 py-2 text-xs shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_16px_32px_-12px_rgba(0,0,0,0.8)]"
      style={{ top: y, left: flip ? undefined : x + 14, right: flip ? width - x + 14 : undefined }}
    >
      {children}
    </div>
  );
}

/** One tooltip line: the value leads, the series name follows. */
export function TooltipRow({ swatch, value, label }: { swatch: ReactNode; value: ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      {swatch}
      <span className="font-semibold tabular-nums text-white">{value}</span>
      <span className="text-white/55">{label}</span>
    </div>
  );
}
