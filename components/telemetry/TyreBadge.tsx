const TYRES: Record<string, { letter: string; colour: string; label: string }> = {
  SOFT: { letter: "S", colour: "#ff453a", label: "Soft" },
  MEDIUM: { letter: "M", colour: "#ffd60a", label: "Medium" },
  HARD: { letter: "H", colour: "#f2f2f7", label: "Hard" },
  INTERMEDIATE: { letter: "I", colour: "#30d158", label: "Intermediate" },
  WET: { letter: "W", colour: "#0a84ff", label: "Wet" },
};

export function tyreLabel(compound: string | null | undefined): string {
  return (compound && TYRES[compound]?.label) || "Unknown";
}

export default function TyreBadge({
  compound,
  size = 20,
}: {
  compound: string | null | undefined;
  size?: number;
}) {
  const tyre = compound ? TYRES[compound] : undefined;
  if (!tyre) {
    return (
      <span className="inline-block text-center text-xs text-white/40" style={{ width: size }}>
        –
      </span>
    );
  }
  return (
    <span
      role="img"
      aria-label={`${tyre.label} tyre`}
      title={tyre.label}
      className="inline-flex shrink-0 items-center justify-center rounded-full font-bold leading-none"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.5,
        color: tyre.colour,
        border: `2px solid ${tyre.colour}`,
      }}
    >
      {tyre.letter}
    </span>
  );
}
