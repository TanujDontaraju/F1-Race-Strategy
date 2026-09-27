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

export interface WeatherRow {
  date: string;
  air_temperature: number | null;
  track_temperature: number | null;
  humidity: number | null;
  pressure: number | null;
  /** 1 while it's raining. */
  rainfall: number | null;
  wind_direction: number | null;
  /** Metres per second. */
  wind_speed: number | null;
}

/** F1's track status: AllClear, Yellow, SCDeployed, VSCDeployed, VSCEnding or Red. */
export interface TrackStatusRow {
  date: string;
  status: string;
}

/** F1's session status: Started, Aborted, Inactive, Finished, Finalised or Ends. */
export interface SessionStatusRow {
  date: string;
  status: string;
}

export interface PitRow {
  date: string;
  driver_number: number;
  lap_number: number;
  /** Seconds stationary in the box. */
  stop_duration: number | null;
  /** Seconds from pit entry to pit exit. */
  lane_duration: number | null;
}

export interface GridRow {
  driver_number: number;
  position: number;
}

export interface RetirementRow {
  date: string;
  driver_number: number;
  /** The lap they were on when they stopped. */
  lap_number: number;
}

/** Qualifying: when F1 flagged a driver as knocked out (at the end of the part they went out in). */
export interface KnockoutRow {
  date: string;
  driver_number: number;
}

/** One lap's car data against distance travelled (metres). */
export interface LapTelemetry {
  driver_number: number;
  lap_number: number;
  lap_duration: number | null;
  length: number;
  car: {
    distance: number[];
    speed: number[];
    throttle: number[];
    brake: number[];
    n_gear: number[];
    rpm: number[];
  };
  /** Seconds into the lap at each position sample, for timing mini-sectors. */
  path: { distance: number[]; time: number[] };
}

/** Epoch-ms range that playback can move through for a session. */
export interface ReplayWindow {
  start: number;
  end: number;
}
