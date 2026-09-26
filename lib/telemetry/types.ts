// Row shapes mirror the OpenF1 (api.openf1.org/v1) and MultiViewer circuit
// responses exactly, so mock fixtures and real responses are interchangeable.

export interface Session {
  session_key: number;
  session_type: string;
  session_name: string;
  date_start: string;
  date_end: string;
  meeting_key: number;
  circuit_key: number;
  circuit_short_name: string;
  country_code: string;
  country_name: string;
  location: string;
  year: number;
  is_cancelled: boolean;
}

export interface Driver {
  driver_number: number;
  broadcast_name: string;
  full_name: string;
  name_acronym: string;
  team_name: string;
  team_colour: string | null;
  first_name: string;
  last_name: string;
  headshot_url: string | null;
}

export interface PositionRow {
  date: string;
  driver_number: number;
  position: number;
}

// Gaps are floats, null for the leader, and strings like "+1 LAP" for lapped cars.
export type GapValue = number | string | null;

export interface IntervalRow {
  date: string;
  driver_number: number;
  gap_to_leader: GapValue;
  interval: GapValue;
}

export interface StintRow {
  driver_number: number;
  stint_number: number;
  lap_start: number;
  lap_end: number | null;
  compound: string | null;
  tyre_age_at_start: number | null;
}

export interface LapRow {
  driver_number: number;
  lap_number: number;
  date_start: string | null;
  lap_duration: number | null;
  duration_sector_1: number | null;
  duration_sector_2: number | null;
  duration_sector_3: number | null;
  is_pit_out_lap: boolean;
  st_speed: number | null;
}

export interface RaceControlRow {
  date: string;
  category: string;
  flag: string | null;
  message: string;
  /** 1–3 during qualifying (Q1/Q2/Q3); null outside qualifying. */
  qualifying_phase: number | null;
  driver_number: number | null;
  lap_number: number | null;
}

export interface LocationRow {
  date: string;
  driver_number: number;
  x: number;
  y: number;
  z: number;
}

export interface CarDataRow {
  date: string;
  driver_number: number;
  speed: number;
  n_gear: number;
  throttle: number;
  brake: number;
  rpm: number;
  drs: number | null;
}

export interface CircuitCorner {
  number: number;
  angle: number;
  trackPosition: { x: number; y: number };
}

export interface CircuitLayout {
  x: number[];
  y: number[];
  rotation: number;
  corners: CircuitCorner[];
  /** Seconds lost to a pit stop under green / safety car / virtual safety car. */
  pitLoss?: { normal: string; sc: string; vsc: string };
}

/** Epoch-ms range that playback can move through for a session. */
export interface ReplayWindow {
  start: number;
  end: number;
}
