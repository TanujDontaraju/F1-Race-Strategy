"use client";

import { KeyboardEvent, useEffect, useLayoutEffect, useRef } from "react";
import { useGlassHighlight } from "@/components/telemetry/useGlassHighlight";

interface SegmentedControlProps<T extends string | number> {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  /** "tabs" switches between panels; "radio" picks a setting. */
  kind?: "tabs" | "radio";
  getLabel?: (option: T) => string;
  className?: string;
}

const SEGMENT = "[data-segment]";
const SELECTED_SEGMENT = '[data-segment][data-selected="true"]';

/** Segments whose current choice is a glass thumb that glides between options. */
export default function SegmentedControl<T extends string | number>({
  label,
  options,
  value,
  onChange,
  kind = "tabs",
  getLabel = String,
  className = "",
}: SegmentedControlProps<T>) {
  const listRef = useRef<HTMLDivElement>(null);
  const { ref: thumbRef, moveTo, trackPointer } = useGlassHighlight<HTMLSpanElement>();
  const { ref: hoverRef, moveTo: moveHover, trackPointer: trackHover } = useGlassHighlight<HTMLSpanElement>();
  const index = options.indexOf(value);
  const isTabs = kind === "tabs";

  const select = (option: T) => {
    moveHover(null);
    onChange(option);
  };

  // A new choice glides the thumb across. A new set of options (the tabs change
  // with the session type) resizes every segment, so the thumb snaps to fit instead.
  const optionsKey = options.join("\u0000");
  const lastOptionsKey = useRef(optionsKey);
  useLayoutEffect(() => {
    const instant = lastOptionsKey.current !== optionsKey;
    lastOptionsKey.current = optionsKey;
    moveTo(listRef.current?.querySelector<HTMLElement>(SELECTED_SEGMENT) ?? null, { instant });
  }, [value, optionsKey, moveTo]);

  // Segments also resize without the options changing: the container stretches, or
  // the web font arrives after the first layout. Keep the thumb on its segment.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const sizes = new Map<Element, string>();
    const observer = new ResizeObserver((entries) => {
      let resized = false;
      for (const entry of entries) {
        const box = entry.target as HTMLElement;
        const size = `${box.offsetWidth}x${box.offsetHeight}`;
        if (sizes.has(box) && sizes.get(box) !== size) resized = true;
        sizes.set(box, size);
      }
      if (resized) moveTo(list.querySelector<HTMLElement>(SELECTED_SEGMENT), { instant: true });
    });
    observer.observe(list);
    list.querySelectorAll(SEGMENT).forEach((segment) => observer.observe(segment));
    return () => observer.disconnect();
  }, [moveTo, optionsKey]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const last = options.length - 1;
    const next =
      e.key === "ArrowRight" ? (index + 1) % options.length
      : e.key === "ArrowLeft" ? (index - 1 + options.length) % options.length
      : e.key === "Home" ? 0
      : e.key === "End" ? last
      : -1;
    if (next < 0) return;
    e.preventDefault();
    select(options[next]);
    listRef.current?.querySelectorAll<HTMLElement>(SEGMENT)[next]?.focus();
  };

  return (
    <div
      ref={listRef}
      role={isTabs ? "tablist" : "radiogroup"}
      aria-label={label}
      onKeyDown={onKeyDown}
      onPointerMove={(e) => {
        trackPointer(e);
        trackHover(e);
        // The lighter glass only marks segments you could switch to, not the current one.
        const segment = (e.target as Element).closest<HTMLElement>(SEGMENT);
        moveHover(segment?.dataset.selected === "false" ? segment : null);
      }}
      onPointerLeave={() => moveHover(null)}
      className={`relative grid gap-1 rounded-full bg-black/30 p-1 ${className}`}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      <span ref={hoverRef} aria-hidden className="glass-hover rounded-full" />
      <span ref={thumbRef} aria-hidden className="glass-highlight rounded-full" />
      {options.map((option) => {
        const selected = option === value;
        return (
          <button
            key={option}
            type="button"
            role={isTabs ? "tab" : "radio"}
            aria-selected={isTabs ? selected : undefined}
            aria-checked={isTabs ? undefined : selected}
            data-segment
            data-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => select(option)}
            className={`relative rounded-full px-3 py-1.5 text-xs font-semibold tabular-nums outline-none transition-[color,transform] duration-150 ease-out active:scale-95 focus-visible:ring-1 focus-visible:ring-white/50 ${
              selected ? "text-white" : "text-white/55 hover:text-white/80"
            }`}
          >
            {getLabel(option)}
          </button>
        );
      })}
    </div>
  );
}
