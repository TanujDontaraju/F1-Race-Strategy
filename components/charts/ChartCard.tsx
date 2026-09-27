"use client";

import { ReactNode, useState } from "react";
import { Card } from "@/components/analysis/parts";
import SegmentedControl from "@/components/telemetry/SegmentedControl";

const MODES = ["Chart", "Table"] as const;
type Mode = (typeof MODES)[number];

/** A chart with its table twin one tap away, so no value is only reachable by hovering. */
export default function ChartCard({
  title,
  subtitle,
  controls,
  chart,
  table,
  className,
}: {
  title: string;
  subtitle?: ReactNode;
  controls?: ReactNode;
  chart: ReactNode;
  table: ReactNode;
  className?: string;
}) {
  const [mode, setMode] = useState<Mode>("Chart");
  return (
    <Card
      title={title}
      subtitle={subtitle}
      className={className}
      action={
        <div className="flex flex-wrap items-center gap-2">
          {controls}
          <SegmentedControl label={`${title} view`} options={MODES} value={mode} onChange={setMode} />
        </div>
      }
    >
      {mode === "Chart" ? chart : table}
    </Card>
  );
}
