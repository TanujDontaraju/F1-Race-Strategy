"use client";

import { PointerEvent, useCallback, useEffect, useRef } from "react";

type Box = { x: number; y: number; w: number; h: number };
const KEYS = ["x", "y", "w", "h"] as const;

// Critically damped spring (damping ratio 1, 0.3s response): retargets from its
// current position and velocity, so sweeping across rows glides instead of jumping.
const RESPONSE = 0.3;
const STIFFNESS = ((2 * Math.PI) / RESPONSE) ** 2;
const DAMPING = (4 * Math.PI) / RESPONSE;
const REST = 0.1;

// A snap keeps re-pinning to its item for this many frames (~0.3s), instead of
// just one: a freshly mounted panel can keep reflowing for a few frames after
// the first paint (an image decoding, a web font swapping in), and one
// confirm frame isn't always enough to catch where it lands.
const SNAP_CONFIRM_FRAMES = 18;

const zero = (): Box => ({ x: 0, y: 0, w: 0, h: 0 });
const measure = (item: HTMLElement): Box => ({
  x: item.offsetLeft,
  y: item.offsetTop,
  w: item.offsetWidth,
  h: item.offsetHeight,
});

/**
 * One glass highlight shared by every item in a list. Render the returned ref on
 * an absolutely positioned `.glass-highlight` element inside the (positioned)
 * list, before the items, and call `moveTo` with the item to highlight.
 */
export function useGlassHighlight<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const state = useRef({
    pos: zero(),
    vel: zero(),
    target: zero(),
    /** The item being highlighted, re-measured every frame in case the layout shifts under it. */
    item: null as HTMLElement | null,
    /** Frames left re-pinning to a just-snapped item, to catch layout that's still settling. */
    snapFrames: 0,
    visible: false,
    frame: 0,
    last: 0,
    pointer: null as { x: number; y: number } | null,
  });

  const paint = useCallback(() => {
    const el = ref.current;
    const s = state.current;
    if (!el) return;
    el.style.translate = `${s.pos.x}px ${s.pos.y}px`;
    el.style.width = `${s.pos.w}px`;
    el.style.height = `${s.pos.h}px`;
    if (s.pointer) {
      el.style.setProperty("--mx", `${s.pointer.x - s.pos.x}px`);
      el.style.setProperty("--my", `${s.pointer.y - s.pos.y}px`);
    }
  }, []);

  const step = useCallback(
    function tick(now: number) {
      const s = state.current;
      // Layout can move the item after it was measured (a panel loading in, a scrollbar
      // appearing), and that in-between layout may never be painted for a
      // ResizeObserver to see. So aim at wherever the item is now.
      if (s.item?.isConnected) s.target = measure(s.item);
      if (s.snapFrames > 0) {
        s.snapFrames--;
        s.pos = { ...s.target };
        s.vel = zero();
        paint();
        s.frame = s.snapFrames > 0 ? requestAnimationFrame(tick) : 0;
        return;
      }
      const dt = Math.min((now - s.last) / 1000, 1 / 30);
      s.last = now;
      let moving = false;
      for (const k of KEYS) {
        const accel = -STIFFNESS * (s.pos[k] - s.target[k]) - DAMPING * s.vel[k];
        s.vel[k] += accel * dt;
        s.pos[k] += s.vel[k] * dt;
        if (Math.abs(s.pos[k] - s.target[k]) > REST || Math.abs(s.vel[k]) > REST) {
          moving = true;
        } else {
          s.pos[k] = s.target[k];
          s.vel[k] = 0;
        }
      }
      paint();
      s.frame = moving ? requestAnimationFrame(tick) : 0;
    },
    [paint]
  );

  const moveTo = useCallback(
    (item: HTMLElement | null, options?: { instant?: boolean }) => {
      const el = ref.current;
      const s = state.current;
      if (!el) return;
      if (!item) {
        s.item = null;
        s.visible = false;
        el.dataset.visible = "false";
        return;
      }
      s.item = item;
      s.target = measure(item);
      // Appearing (or reduced motion): materialise in place rather than sliding in from the last spot.
      const snap =
        options?.instant || !s.visible || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      s.visible = true;
      el.dataset.visible = "true";
      if (snap) {
        cancelAnimationFrame(s.frame);
        s.pos = { ...s.target };
        s.vel = zero();
        paint();
        // Keep re-pinning for a few frames, in case the layout is still settling.
        s.snapFrames = SNAP_CONFIRM_FRAMES;
        s.frame = requestAnimationFrame(step);
      } else {
        // Carry on from the current motion if the spring is running; otherwise start it now.
        if (!s.frame || s.snapFrames > 0) s.last = performance.now();
        s.snapFrames = 0;
        cancelAnimationFrame(s.frame);
        s.frame = requestAnimationFrame(step);
      }
    },
    [paint, step]
  );

  /** Feeds the pointer position to the specular sheen; attach to the list's onPointerMove. */
  const trackPointer = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      const list = e.currentTarget;
      const rect = list.getBoundingClientRect();
      state.current.pointer = {
        x: e.clientX - rect.left - list.clientLeft + list.scrollLeft,
        y: e.clientY - rect.top - list.clientTop + list.scrollTop,
      };
      paint();
    },
    [paint]
  );

  useEffect(() => {
    const s = state.current;
    return () => cancelAnimationFrame(s.frame);
  }, []);

  return { ref, moveTo, trackPointer };
}
