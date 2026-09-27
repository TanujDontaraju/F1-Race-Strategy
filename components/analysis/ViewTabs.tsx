"use client";

import SegmentedControl from "@/components/telemetry/SegmentedControl";
import { useTelemetryStore } from "@/lib/telemetry/store";
import { ViewId, viewsFor } from "@/lib/telemetry/views";

/** The row of views for the session: Pit Wall first, then that session type's analysis tabs. */
export default function ViewTabs() {
  const session = useTelemetryStore((s) => s.session);
  const view = useTelemetryStore((s) => s.view);
  const setView = useTelemetryStore((s) => s.setView);
  const views = viewsFor(session);
  const labels = new Map(views.map((v) => [v.id, v.label]));

  return (
    // Scrolls sideways on narrow screens rather than squashing the labels.
    <nav aria-label="Session views" className="glass-chrome shrink-0 overflow-x-auto rounded-full p-1.5 [scrollbar-width:none]">
      <SegmentedControl<ViewId>
        label="Session views"
        options={views.map((v) => v.id)}
        value={view}
        onChange={setView}
        getLabel={(id) => labels.get(id) ?? id}
        className="min-w-max"
      />
    </nav>
  );
}
