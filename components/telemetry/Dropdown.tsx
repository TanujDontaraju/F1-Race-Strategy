"use client";

import { Check, ChevronDown } from "lucide-react";
import { KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { useGlassHighlight } from "@/components/telemetry/useGlassHighlight";

export interface DropdownOption {
  value: string;
  label: string;
}

interface DropdownProps {
  label: string;
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
}

const TYPEAHEAD_RESET_MS = 700;
const LIST_PADDING = 6;

export default function Dropdown({ label, value, options, onChange, disabled }: DropdownProps) {
  const id = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typeahead = useRef({ text: "", at: 0 });
  const { ref: selectedRef, moveTo: moveSelected, trackPointer: trackSelected } = useGlassHighlight<HTMLLIElement>();
  const { ref: hoverRef, moveTo: moveHover, trackPointer: trackHover } = useGlassHighlight<HTMLLIElement>();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = options[selectedIndex];

  const openList = () => {
    setActive(Math.max(selectedIndex, 0));
    setOpen(true);
  };

  const close = () => {
    setOpen(false);
    buttonRef.current?.focus();
  };

  const commit = (index: number) => {
    const option = options[index];
    if (option && option.value !== value) onChange(option.value);
    close();
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

  // Full glass on the current choice, lighter glass on the option being pointed at
  // (by pointer or arrow keys); keep that option visible without scrolling the page.
  useEffect(() => {
    const list = listRef.current;
    const option = (i: number) => (open ? document.getElementById(`${id}-option-${i}`) : null);
    const item = option(active);
    moveSelected(option(selectedIndex));
    moveHover(active === selectedIndex ? null : item);
    if (!list || !item) return;
    if (item.offsetTop < list.scrollTop + LIST_PADDING) {
      list.scrollTop = item.offsetTop - LIST_PADDING;
    } else if (item.offsetTop + item.offsetHeight > list.scrollTop + list.clientHeight - LIST_PADDING) {
      list.scrollTop = item.offsetTop + item.offsetHeight - list.clientHeight + LIST_PADDING;
    }
  }, [open, active, selectedIndex, id, moveSelected, moveHover]);

  const onButtonKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      openList();
    }
  };

  const onListKeyDown = (e: KeyboardEvent<HTMLUListElement>) => {
    const last = options.length - 1;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActive((i) => Math.min(i + 1, last));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActive((i) => Math.max(i - 1, 0));
        break;
      case "Home":
        e.preventDefault();
        setActive(0);
        break;
      case "End":
        e.preventDefault();
        setActive(last);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        commit(active);
        break;
      case "Escape":
        e.preventDefault();
        close();
        break;
      case "Tab":
        setOpen(false);
        break;
      default:
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          const now = e.timeStamp;
          const t = typeahead.current;
          t.text = (now - t.at > TYPEAHEAD_RESET_MS ? "" : t.text) + e.key.toLowerCase();
          t.at = now;
          const match = options.findIndex((o) => o.label.toLowerCase().startsWith(t.text));
          if (match >= 0) setActive(match);
        }
    }
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-label={`${label}: ${selected?.label ?? "none"}`}
        onClick={() => (open ? close() : openList())}
        onKeyDown={onButtonKeyDown}
        className="group flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.07] py-1.5 pl-3.5 pr-3 text-left text-sm font-medium text-white transition-[background-color,transform] duration-100 ease-out hover:bg-white/[0.11] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40 aria-expanded:bg-white/[0.11]"
      >
        {/* Every label stacked in one cell sizes the button to the widest option, like a native select. */}
        <span className="grid" aria-hidden>
          {options.map((o) => (
            <span
              key={o.value}
              className={`col-start-1 row-start-1 whitespace-nowrap ${o.value === value ? "" : "invisible"}`}
            >
              {o.label}
            </span>
          ))}
          {!selected && <span className="col-start-1 row-start-1 text-white/50">—</span>}
        </span>
        <ChevronDown
          size={14}
          aria-hidden
          className="shrink-0 text-white/60 transition-transform duration-200 ease-out group-aria-expanded:rotate-180"
        />
      </button>

      <ul
        ref={listRef}
        id={`${id}-list`}
        role="listbox"
        aria-label={label}
        tabIndex={-1}
        aria-activedescendant={open ? `${id}-option-${active}` : undefined}
        data-open={open}
        onKeyDown={onListKeyDown}
        onPointerMove={(e) => {
          trackSelected(e);
          trackHover(e);
          const option = (e.target as Element).closest<HTMLElement>('[role="option"]');
          moveHover(option?.getAttribute("aria-selected") === "false" ? option : null);
        }}
        onPointerLeave={() => moveHover(null)}
        className="dropdown-menu absolute left-0 top-full z-50 mt-2 max-h-[min(22rem,60vh)] min-w-full overflow-y-auto rounded-[20px] p-1.5 outline-none"
      >
        <li ref={hoverRef} aria-hidden className="glass-hover rounded-[14px]" />
        <li ref={selectedRef} aria-hidden className="glass-highlight rounded-[14px]" />
        {options.map((o, i) => {
          const isSelected = o.value === value;
          return (
            <li
              key={o.value}
              id={`${id}-option-${i}`}
              role="option"
              aria-selected={isSelected}
              data-active={i === active}
              onPointerMove={() => setActive(i)}
              onClick={() => commit(i)}
              className="relative flex cursor-pointer items-center justify-between gap-4 whitespace-nowrap rounded-[14px] px-3 py-2 text-sm text-white/75 transition-colors duration-150 data-[active=true]:text-white aria-selected:font-semibold aria-selected:text-white"
            >
              {o.label}
              <Check size={14} aria-hidden className={`shrink-0 text-f1-red ${isSelected ? "" : "invisible"}`} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
