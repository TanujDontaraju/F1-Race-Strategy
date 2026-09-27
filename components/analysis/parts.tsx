import { ReactNode } from "react";
import GlassPanel from "@/components/telemetry/GlassPanel";
import { teamColour } from "@/lib/telemetry/format";
import { Driver } from "@/lib/telemetry/types";

/** A titled glass card: the building block of every analysis view. */
export function Card({
  title,
  subtitle,
  action,
  className = "",
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <GlassPanel className={`flex min-w-0 flex-col gap-3 p-4 sm:p-5 ${className}`} aria-label={title}>
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-1">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs font-medium text-white/55">{subtitle}</p>}
        </div>
        {action}
      </header>
      {children}
    </GlassPanel>
  );
}

/** One headline number with its label, and optionally who or when underneath. */
export function StatTile({ label, value, detail }: { label: string; value: ReactNode; detail?: ReactNode }) {
  return (
    <div className="min-w-0 rounded-[20px] bg-white/[0.04] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
      <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-white/55">{label}</dt>
      <dd className="mt-1 truncate text-xl font-bold tabular-nums tracking-tight">{value}</dd>
      {detail && <dd className="mt-0.5 truncate text-xs font-medium text-white/55">{detail}</dd>}
    </div>
  );
}

/** Team colour bar, three-letter code and surname; the surname drops out on narrow screens. */
export function DriverName({ driver, full = true }: { driver: Driver; full?: boolean }) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <span className="h-4 w-[3px] shrink-0 rounded-full" style={{ background: teamColour(driver) }} aria-hidden />
      <span className="text-sm font-bold tracking-[0.04em]">{driver.name_acronym}</span>
      {full && <span className="hidden truncate text-sm text-white/60 sm:inline">{driver.last_name}</span>}
    </span>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="px-1 py-8 text-center text-sm text-white/50">{children}</p>;
}

// Shared table styling: recessive header, hairline rows, numbers in tabular figures.
export const TABLE = "w-full border-collapse text-sm";
export const TH = "px-2 pb-2 text-left text-[11px] font-medium uppercase tracking-[0.08em] text-white/50 first:pl-1";
export const TH_NUM = `${TH} text-right`;
export const TR = "border-t border-white/[0.06]";
export const TD = "px-2 py-2 first:pl-1";
export const TD_NUM = `${TD} text-right tabular-nums`;
