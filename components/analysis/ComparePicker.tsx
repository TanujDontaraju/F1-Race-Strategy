"use client";

import { Check, ChevronDown } from "lucide-react";
import { KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import { useGlassHighlight } from "@/components/telemetry/useGlassHighlight";
import { positionAt } from "@/lib/telemetry/derive";
import { teamColour } from "@/lib/telemetry/format";
import { MAX_COMPARE, useTelemetryStore } from "@/lib/telemetry/store";

const LIST_PADDING = 6;

/** Picks which drivers the analysis views compare (up to MAX_COMPARE), listed in finishing order. */
export default function ComparePicker() {
  const id = useId();
  const drivers = useTelemetryStore((s) => s.drivers);
  const timeline = useTelemetryStore((s) => s.timeline);
  const replay = useTelemetryStore((s) => s.replay);
  const compare = useTelemetryStore((s) => s.compare);
  const setCompare = useTelemetryStore((s) => s.setCompare);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const { ref: hoverRef, moveTo: moveHover, trackPointer } = useGlassHighlight<HTMLLIElement>();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const ordered = useMemo(() => {
    if (!timeline || !replay) return drivers;
    const finish = (n: number) => positionAt(timeline, n, replay.end) ?? 99;
    return [...drivers].sort((a, b) => finish(a.driver_number) - finish(b.driver_number));
  }, [drivers, timeline, replay]);
  const full = compare.length >= MAX_COMPARE;

  const toggle = (n: number) => {
    if (compare.includes(n)) {
      if (compare.length > 1) setCompare(compare.filter((c) => c !== n));
    } else if (!full) {
      setCompare([...compare, n]);
    }
  };

  const close = () => {
    setOpen(false);
    buttonRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    listRef.current?.focus({ preventScroll: true });
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!buttonRef.current?.contains(target) && !listRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => {
    const list = listRef.current;
    const item = open ? document.getElementById(`${id}-option-${active}`) : null;
    moveHover(item);
    if (!list || !item) return;
    if (item.offsetTop < list.scrollTop + LIST_PADDING) {
      list.scrollTop = item.offsetTop - LIST_PADDING;
    } else if (item.offsetTop + item.offsetHeight > list.scrollTop + list.clientHeight - LIST_PADDING) {
      list.scrollTop = item.offsetTop + item.offsetHeight - list.clientHeight + LIST_PADDING;
    }
  }, [open, active, id, moveHover]);

  const onListKeyDown = (e: KeyboardEvent<HTMLUListElement>) => {
    const last = ordered.length - 1;
    if (e.key === "ArrowDown") setActive((i) => Math.min(i + 1, last));
    else if (e.key === "ArrowUp") setActive((i) => Math.max(i - 1, 0));
    else if (e.key === "Home") setActive(0);
    else if (e.key === "End") setActive(last);
    else if (e.key === "Enter" || e.key === " ") {
      const driver = ordered[active];
      if (driver) toggle(driver.driver_number);
    } else if (e.key === "Escape") close();
    else if (e.key === "Tab") setOpen(false);
    else return;
    e.preventDefault();
  };

  const chosen = compare
    .map((n) => drivers.find((d) => d.driver_number === n))
    .filter((d) => d != null);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        disabled={drivers.length === 0}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-label={`Compare drivers: ${chosen.map((d) => d.name_acronym).join(", ") || "none"}`}
        onClick={() => (open ? close() : (setActive(0), setOpen(true)))}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setActive(0);
            setOpen(true);
          }
        }}
        className="group flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.07] py-1.5 pl-2 pr-3 text-sm font-medium text-white transition-[background-color,transform] duration-100 ease-out hover:bg-white/[0.11] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40 aria-expanded:bg-white/[0.11]"
      >
        <span className="flex items-center gap-1">
          {chosen.map((d) => (
            <span
              key={d.driver_number}
              className="flex items-center gap-1.5 rounded-full bg-black/30 py-0.5 pl-1.5 pr-2 text-xs font-bold tracking-[0.04em]"
            >
              <span className="h-3 w-[3px] rounded-full" style={{ background: teamColour(d) }} />
              {d.name_acronym}
            </span>
          ))}
        </span>
        <span className="text-xs tabular-nums text-white/50">
          {compare.length}/{MAX_COMPARE}
        </span>
        <ChevronDown
          size={14}
          aria-hidden
          className="text-white/60 transition-transform duration-200 ease-out group-aria-expanded:rotate-180"
        />
      </button>

      <ul
        ref={listRef}
        id={`${id}-list`}
        role="listbox"
        aria-label="Drivers to compare"
        aria-multiselectable
        tabIndex={-1}
        aria-activedescendant={open ? `${id}-option-${active}` : undefined}
        data-open={open}
        onKeyDown={onListKeyDown}
        onPointerMove={trackPointer}
        onPointerLeave={() => moveHover(null)}
        className="dropdown-menu absolute right-0 top-full z-50 mt-2 max-h-[min(24rem,65vh)] w-64 overflow-y-auto rounded-[20px] p-1.5 outline-none [transform-origin:top_right]"
      >
        <li className="px-3 pb-2 pt-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-white/45" aria-hidden>
          Compare up to {MAX_COMPARE}
        </li>
        <li ref={hoverRef} aria-hidden className="glass-hover rounded-[14px]" />
        {ordered.map((d, i) => {
          const checked = compare.includes(d.driver_number);
          const disabled = !checked && full;
          return (
            <li
              key={d.driver_number}
              id={`${id}-option-${i}`}
              role="option"
              aria-selected={checked}
              aria-disabled={disabled}
              onPointerMove={() => setActive(i)}
              onClick={() => toggle(d.driver_number)}
              className={`relative flex cursor-pointer items-center gap-3 rounded-[14px] px-3 py-2 text-sm ${
                disabled ? "cursor-not-allowed text-white/35" : "text-white/85"
              }`}
            >
              <span
                aria-hidden
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border transition-colors duration-150 ${
                  checked ? "border-white bg-white text-black" : "border-white/30"
                }`}
              >
                {checked && <Check size={11} strokeWidth={3} />}
              </span>
              <span className="h-4 w-[3px] shrink-0 rounded-full" style={{ background: teamColour(d) }} />
              <span className="w-9 font-bold tracking-[0.04em]">{d.name_acronym}</span>
              <span className="truncate text-white/55">{d.last_name}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
