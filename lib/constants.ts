export type TireCompoundName = "SOFT" | "MEDIUM" | "HARD" | "INTERMEDIATE" | "WET";

export interface TireCompound {
  degradation: number;
  offset: number;
}

// Port of TIRE_COMPOUNDS in backend/app.py (previously defined inline in the
// Streamlit app; degradation = time lost per lap of tire age, offset = time
// delta from MEDIUM on fresh tires).
export const TIRE_COMPOUNDS: Record<TireCompoundName, TireCompound> = {
  SOFT: { degradation: 0.25, offset: -0.5 },
  MEDIUM: { degradation: 0.15, offset: 0.0 },
  HARD: { degradation: 0.08, offset: 0.7 },
  INTERMEDIATE: { degradation: 0.2, offset: 4.0 },
  WET: { degradation: 0.18, offset: 9.0 },
};

export const TIRE_COMPOUND_NAMES = Object.keys(TIRE_COMPOUNDS) as TireCompoundName[];
