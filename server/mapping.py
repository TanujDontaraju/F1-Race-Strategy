"""F1 live-timing frames → the row shapes in lib/telemetry/types.ts.

The live SignalR feed and F1's static archive (a recording of that feed) deliver
the same frames, so both go through FeedMapper: feed it frames in time order,
then call finish(). All times are epoch milliseconds (UTC).
"""

import re
from dataclasses import dataclass, field
from datetime import datetime, timezone

MISSING = object()

# Laps and final sectors can arrive a moment after the lap count that closes them.
LATE_LAP_TIME_MS = 30_000
LATE_FINAL_SECTOR_MS = 10_000
# Window around a session: lead-in before the start, and how long after the flag cars can still finish.
LEAD_IN_MS = 10_000
FINISH_GRACE_MS = 300_000
TAIL_MS = 5_000

_FRACTION = re.compile(r"(\.\d{6})\d+")
_LAPPED = re.compile(r"\+?(\d+)\s*L(?:APS?)?")
# "CAR 81 (PIA) TIME 1:58.595 DELETED - … LAP 40 …" or "CAR 1 (NOR) LAP DELETED - … LAP 30 …"
_DELETED = re.compile(r"CAR (\d+) \(\w+\) (?:TIME ([\d:.]+)|LAP) (DELETED|REINSTATED)(?:.*?\bLAP (\d+))?")


def parse_utc(text: str) -> float:
    """"2026-09-26T10:07:03.2903931Z", or "2026-09-26T10:11:25" (UTC with no suffix) → epoch ms."""
    moment = datetime.fromisoformat(_FRACTION.sub(r"\1", text.rstrip("Z")))
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    return moment.timestamp() * 1000


def iso(ms: float) -> str:
    return datetime.fromtimestamp(ms / 1000, timezone.utc).isoformat(timespec="milliseconds")


def parse_seconds(text) -> float | None:
    """Lap and sector times: "1:45.678" → 105.678, "25.661" → 25.661."""
    if not isinstance(text, str) or not text.strip():
        return None
    minutes, _, seconds = text.strip().rpartition(":")
    try:
        return round(int(minutes or 0) * 60 + float(seconds), 3)
    except ValueError:
        return None


def parse_gap(text):
    """F1 gap strings → OpenF1's GapValue: seconds, "+1 LAP" / "+2 LAPS", or None for the leader."""
    if not isinstance(text, str) or not text.strip():
        return MISSING
    text = text.strip()
    if text.startswith("LAP"):  # the leader's column shows the lap count
        return None
    lapped = _LAPPED.fullmatch(text)
    if lapped:
        laps = int(lapped[1])
        return f"+{laps} LAP" if laps == 1 else f"+{laps} LAPS"
    try:
        return float(text.lstrip("+"))
    except ValueError:
        return text


def entries(container) -> list[tuple[int, object]]:
    """Snapshots send collections as lists; later deltas send {"index": item} dicts."""
    if isinstance(container, list):
        return list(enumerate(container))
    if isinstance(container, dict):
        return [(int(k), v) for k, v in container.items() if k.isdigit()]
    return []


@dataclass
class Lap:
    number: int
    start: float | None = None
    end: float | None = None
    duration: float | None = None
    sectors: list = field(default_factory=lambda: [None, None, None])
    speed_trap: int | None = None
    pit_out: bool = False
    deleted: bool = False


@dataclass
class DriverTiming:
    crossings: int = 0  # F1's NumberOfLaps: times across the timing line
    current: Lap | None = None  # None while in the garage
    laps: list[Lap] = field(default_factory=list)
    pending_lap_time: tuple[float, float] | None = None
    position: int | None = None
    gap: object = MISSING
    interval: object = MISSING
    stints: dict[int, dict] = field(default_factory=dict)
    stint_start: dict[int, int] = field(default_factory=dict)
    stops: list[float] = field(default_factory=list)  # times flagged Stopped or Retired


class FeedMapper:
    def __init__(self):
        self.info: dict = {}
        self.drivers: dict[str, dict] = {}
        self.timing: dict[str, DriverTiming] = {}
        self.positions: list[dict] = []
        self.intervals: list[dict] = []
        self.race_control: list[dict] = []
        self.statuses: list[tuple[float, str]] = []
        self.track_status: list[dict] = []
        self.weather: list[dict] = []
        self.pits: dict[tuple[int, int], dict] = {}  # (driver, lap) → stop; snapshots repeat earlier stops
        self.grid: dict[int, int] = {}
        self.retirements: list[dict] = []
        self.knockouts: dict[int, float] = {}  # qualifying: driver → when F1 marked them knocked out
        self.qualifying_part: int | None = None
        self._weather_state: dict = {}
        self._started_phases: set = set()
        self._timing_seen = False
        self._handlers = {
            "SessionInfo": self._session_info,
            "SessionData": self._session_data,
            "DriverList": self._driver_list,
            "TimingData": self._timing_data,
            "TimingAppData": self._timing_app_data,
            "TyreStintSeries": self._stint_series,
            "PitLaneTimeCollection": self._pit_lane_times,
            "PitStopSeries": self._pit_stops,
            "RaceControlMessages": self._race_control,
            "WeatherData": self._weather,
        }

    @property
    def is_race(self) -> bool:
        return self.info.get("Type") == "Race"

    @property
    def is_qualifying(self) -> bool:
        return self.info.get("Type") == "Qualifying"

    def apply(self, topic: str, payload, t: float) -> None:
        handler = self._handlers.get(topic)
        if handler and isinstance(payload, dict):
            handler(payload, t)

    def _driver(self, number: str) -> DriverTiming:
        if number not in self.timing:
            # Race cars start lap 1 on the grid; elsewhere a lap only starts on leaving the pits.
            self.timing[number] = DriverTiming(current=Lap(1) if self.is_race else None)
        return self.timing[number]

    # --- topics -----------------------------------------------------------

    def _session_info(self, payload: dict, t: float) -> None:
        self.info.update(payload)

    def _session_data(self, payload: dict, t: float) -> None:
        for _, entry in entries(payload.get("Series")):
            if isinstance(entry, dict) and "QualifyingPart" in entry:
                self.qualifying_part = entry["QualifyingPart"] or None
        for _, entry in entries(payload.get("StatusSeries")):
            if not isinstance(entry, dict):
                continue
            date = parse_utc(entry["Utc"]) if entry.get("Utc") else t
            # AllClear / Yellow / SCDeployed / VSCDeployed / VSCEnding / Red
            if "TrackStatus" in entry:
                self.track_status.append({"date": date, "status": entry["TrackStatus"]})
            if "SessionStatus" not in entry:
                continue
            status = entry["SessionStatus"]
            self.statuses.append((date, status))
            if status != "Started":
                continue
            # The row derive.ts splits qualifying on. A restart after a red flag isn't a new phase.
            phase = self.qualifying_part if self.is_qualifying else None
            if phase in self._started_phases:
                continue
            self._started_phases.add(phase)
            self.race_control.append({
                "date": date, "category": "SessionStatus", "flag": None, "message": "SESSION STARTED",
                "qualifying_phase": phase, "driver_number": None, "lap_number": None,
            })

    def _driver_list(self, payload: dict, t: float) -> None:
        for number, info in payload.items():
            if isinstance(info, dict):
                self.drivers.setdefault(number, {}).update(info)

    def _timing_app_data(self, payload: dict, t: float) -> None:
        for number, line in (payload.get("Lines") or {}).items():
            grid = line.get("GridPos") if isinstance(line, dict) else None
            if isinstance(grid, str) and grid.isdigit() and number.isdigit():
                self.grid[int(number)] = int(grid)

    def _pit(self, number: int, lap: int, t: float) -> dict:
        return self.pits.setdefault((number, lap), {
            "date": t, "driver_number": number, "lap_number": lap, "stop_duration": None, "lane_duration": None,
        })

    def _pit_lane_times(self, payload: dict, t: float) -> None:
        """Every pit lane visit, with its entry-to-exit time."""
        for number, visit in (payload.get("PitTimes") or {}).items():
            if not number.isdigit() or not isinstance(visit, dict) or not str(visit.get("Lap", "")).isdigit():
                continue
            pit = self._pit(int(number), int(visit["Lap"]), t)
            pit["lane_duration"] = parse_seconds(visit.get("Duration")) or pit["lane_duration"]

    def _pit_stops(self, payload: dict, t: float) -> None:
        """Adds the stationary time, which F1 only publishes for some stops."""
        for number, stops in (payload.get("PitTimes") or {}).items():
            if not number.isdigit():
                continue
            for _, stop in entries(stops):
                detail = stop.get("PitStop") if isinstance(stop, dict) else None
                if not isinstance(detail, dict) or not str(detail.get("Lap", "")).isdigit():
                    continue
                pit = self._pit(int(number), int(detail["Lap"]), t)
                if stop.get("Timestamp"):
                    pit["date"] = parse_utc(stop["Timestamp"])
                pit["stop_duration"] = parse_seconds(detail.get("PitStopTime"))
                pit["lane_duration"] = parse_seconds(detail.get("PitLaneTime")) or pit["lane_duration"]

    def _weather(self, payload: dict, t: float) -> None:
        self._weather_state.update(payload)
        w = self._weather_state

        def number(key: str) -> float | None:
            try:
                return float(w[key])
            except (KeyError, TypeError, ValueError):
                return None

        self.weather.append({
            "date": t,
            "air_temperature": number("AirTemp"),
            "track_temperature": number("TrackTemp"),
            "humidity": number("Humidity"),
            "pressure": number("Pressure"),
            "rainfall": number("Rainfall"),
            "wind_direction": number("WindDirection"),
            "wind_speed": number("WindSpeed"),  # m/s
        })

    def _timing_data(self, payload: dict, t: float) -> None:
        lines = payload.get("Lines")
        if not isinstance(lines, dict):
            return
        # The first frame is a full snapshot: its lap counts are a baseline, not completions.
        snapshot = not self._timing_seen
        self._timing_seen = True
        for number, delta in lines.items():
            if isinstance(delta, dict):
                self._driver_timing(number, delta, t, snapshot)

    def _driver_timing(self, number: str, delta: dict, t: float, snapshot: bool) -> None:
        s = self._driver(number)
        crossings = delta.get("NumberOfLaps")
        if snapshot:
            # Joining mid-session: take the count as it stands; the lap in progress started earlier.
            if isinstance(crossings, int) and crossings > 0:
                s.crossings = crossings
                s.current = Lap(crossings + 1 if self.is_race else crossings)
        else:
            # Sectors first: the final sector usually arrives in the same frame as the crossing that ends its lap.
            for index, sector in entries(delta.get("Sectors")):
                if isinstance(sector, dict) and index < 3:
                    self._sector(s, index, parse_seconds(sector.get("Value")), t)
            speeds = delta.get("Speeds")
            trap = speeds.get("ST") if isinstance(speeds, dict) else None
            if s.current and isinstance(trap, dict) and str(trap.get("Value", "")).isdigit():
                s.current.speed_trap = int(trap["Value"])
            if isinstance(crossings, int) and crossings > s.crossings:
                self._crossing(s, crossings, t)
            # Outside races an in-lap ends at the pit entry, with no crossing to close it.
            if not self.is_race and delta.get("InPit") is True and s.current:
                self._end_lap(s, t)
                s.current = None
            if delta.get("PitOut") is True:
                if s.current is None:
                    s.current = Lap(s.crossings + 1)
                s.current.pit_out = True
                s.current.start = t
            last = delta.get("LastLapTime")
            if isinstance(last, dict):
                self._lap_time(s, parse_seconds(last.get("Value")), t)

        if delta.get("Stopped") is True or delta.get("Retired") is True:
            s.stops.append(t)
        if self.is_qualifying and delta.get("KnockedOut") is True and number.isdigit():
            self.knockouts.setdefault(int(number), t)

        position = delta.get("Position")
        if isinstance(position, str) and position.isdigit() and int(position) != s.position:
            s.position = int(position)
            self.positions.append({"date": t, "driver_number": int(number), "position": s.position})

        if self.is_race:
            self._gaps(number, s, delta, t)

    def _sector(self, s: DriverTiming, index: int, value: float | None, t: float) -> None:
        if value is None:
            return
        previous = s.laps[-1] if s.laps else None
        just_ended = (
            previous is not None
            and previous.sectors[index] is None
            and previous.end is not None
            and t - previous.end < LATE_FINAL_SECTOR_MS
        )
        # A final sector that lands just after its lap ended still belongs to that lap.
        if just_ended and (s.current is None or (index == 2 and s.current.sectors[0] is None)):
            previous.sectors[index] = value
        elif s.current:
            s.current.sectors[index] = value

    def _crossing(self, s: DriverTiming, crossings: int, t: float) -> None:
        """Crossing the timing line ends the lap in progress and starts the next.

        Races count completed laps (the first crossing ends lap 1). Practice and
        qualifying count laps started: leaving the pits crosses the line in the
        pit lane, and that crossing starts lap 1.
        """
        if not self.is_race and s.current and s.current.number == crossings:
            s.crossings = crossings  # pit exit already started this lap
            return
        if s.current:
            if self.is_race:
                s.current.number = crossings
            self._end_lap(s, t)
        s.crossings = crossings
        s.current = Lap(crossings + 1 if self.is_race else crossings, start=t)

    def _end_lap(self, s: DriverTiming, t: float) -> None:
        lap = s.current
        lap.end = t
        if s.pending_lap_time and t - s.pending_lap_time[1] < LATE_FINAL_SECTOR_MS:
            lap.duration = s.pending_lap_time[0]
        s.pending_lap_time = None
        s.laps.append(lap)

    def _lap_time(self, s: DriverTiming, value: float | None, t: float) -> None:
        if value is None:
            return
        latest = s.laps[-1] if s.laps else None
        if latest and latest.duration is None and t - latest.end < LATE_LAP_TIME_MS:
            latest.duration = value
        elif latest is None or latest.duration != value:
            s.pending_lap_time = (value, t)  # arrived just before its lap count

    def _gaps(self, number: str, s: DriverTiming, delta: dict, t: float) -> None:
        gap = parse_gap(delta.get("GapToLeader"))
        ahead = delta.get("IntervalToPositionAhead")
        interval = parse_gap(ahead.get("Value")) if isinstance(ahead, dict) else MISSING
        changed = False
        if gap is not MISSING and gap != s.gap:
            s.gap, changed = gap, True
        if interval is not MISSING and interval != s.interval:
            s.interval, changed = interval, True
        if changed and s.gap is not MISSING:
            self.intervals.append({
                "date": t, "driver_number": int(number), "gap_to_leader": s.gap,
                "interval": None if s.interval is MISSING else s.interval,
            })

    def _stint_series(self, payload: dict, t: float) -> None:
        stints = payload.get("Stints")
        if not isinstance(stints, dict):
            return
        for number, driver_stints in stints.items():
            s = self._driver(number)
            for index, stint in entries(driver_stints):
                if not isinstance(stint, dict):
                    continue
                if index not in s.stints:
                    s.stints[index] = {}
                    # Outside races a new set appears just after the pit-lane crossing that starts its out-lap.
                    s.stint_start[index] = s.current.number if s.current else s.crossings + 1
                s.stints[index].update(stint)

    def _race_control(self, payload: dict, t: float) -> None:
        for _, message in entries(payload.get("Messages")):
            if not isinstance(message, dict):
                continue
            number = message.get("RacingNumber")
            self.race_control.append({
                "date": parse_utc(message["Utc"]) if message.get("Utc") else t,
                "category": message.get("Category", ""),
                "flag": message.get("Flag"),
                "message": message.get("Message", ""),
                "qualifying_phase": self.qualifying_part if self.is_qualifying else None,
                "driver_number": int(number) if isinstance(number, str) and number.isdigit() else None,
                "lap_number": message.get("Lap"),
            })

    # --- results ----------------------------------------------------------

    def _apply_deletions(self) -> None:
        """Track-limits deletions arrive as race control messages naming the lap time."""
        for row in sorted(self.race_control, key=lambda r: r["date"]):
            match = _DELETED.search(row["message"])
            s = self.timing.get(match[1]) if match else None
            if not s:
                continue
            time, lap_number = parse_seconds(match[2]), match[4] and int(match[4])
            for lap in s.laps:
                same_time = time is not None and lap.duration is not None and abs(lap.duration - time) < 0.0005
                if same_time or (time is None and lap.number == lap_number):
                    lap.deleted = match[3] == "DELETED"

    def _retirements(self) -> None:
        """Mark cars out of the race so their gap doesn't freeze at its last value.

        F1 only sometimes sets Retired; a car that stops and never completes
        another lap before the flag is out either way. Stopping after taking
        the flag isn't a retirement.
        """
        flags = [d for d, status in self.statuses if status in ("Finished", "Aborted")]
        flag = flags[-1] if flags else None
        for number, s in self.timing.items():
            last_lap_end = max((lap.end for lap in s.laps if lap.end is not None), default=None)
            if flag is not None and last_lap_end is not None and last_lap_end >= flag:
                continue  # took the flag
            final_stops = [t for t in s.stops if last_lap_end is None or t >= last_lap_end]
            if not final_stops or (flag is not None and final_stops[0] >= flag):
                continue
            out, driver = final_stops[0], int(number)
            # Drop stale gaps F1 keeps sending for the stopped car, so "OUT" stays the latest.
            self.intervals = [r for r in self.intervals if r["driver_number"] != driver or r["date"] < out]
            self.intervals.append({"date": out, "driver_number": driver, "gap_to_leader": "OUT", "interval": None})
            # The lap they were on when they stopped.
            lap = s.laps[-1].number + 1 if s.laps else 1
            self.retirements.append({"date": out, "driver_number": driver, "lap_number": lap})

    def driver_rows(self) -> list[dict]:
        return [
            {
                "driver_number": int(d.get("RacingNumber", number)),
                "broadcast_name": d.get("BroadcastName", ""),
                "full_name": d.get("FullName", ""),
                "name_acronym": d.get("Tla", ""),
                "team_name": d.get("TeamName", ""),
                "team_colour": d.get("TeamColour"),
                "first_name": d.get("FirstName", ""),
                "last_name": d.get("LastName", ""),
                "headshot_url": d.get("HeadshotUrl"),
            }
            for number, d in self.drivers.items()
            if number.isdigit() and d.get("Tla")
        ]

    def _standing_start_lap(self, lap: Lap, race_start: float) -> None:
        """F1 sends no lap time or first sector for a race's opening lap: it runs from lights out."""
        lap.start = race_start
        if lap.duration is None and lap.end is not None:
            lap.duration = round((lap.end - race_start) / 1000, 3)
        s2, s3 = lap.sectors[1], lap.sectors[2]
        if lap.sectors[0] is None and lap.duration and s2 is not None and s3 is not None:
            lap.sectors[0] = round(lap.duration - s2 - s3, 3)

    def lap_rows(self) -> list[dict]:
        race_start = next((d for d, status in self.statuses if status == "Started"), None) if self.is_race else None
        rows = []
        for number, s in self.timing.items():
            for lap in s.laps:
                if race_start is not None and lap.number == 1:
                    self._standing_start_lap(lap, race_start)
                if lap.duration is None and None not in lap.sectors:
                    lap.duration = round(sum(lap.sectors), 3)
                # The crossing that started a lap is exact; F1's out-lap times run from the previous run.
                start = lap.start if lap.start is not None else (
                    lap.end - lap.duration * 1000 if lap.duration and lap.end else None
                )
                rows.append({
                    "driver_number": int(number),
                    "lap_number": lap.number,
                    "date_start": start,
                    "lap_duration": None if lap.deleted else lap.duration,
                    "duration_sector_1": lap.sectors[0],
                    "duration_sector_2": lap.sectors[1],
                    "duration_sector_3": lap.sectors[2],
                    "is_pit_out_lap": lap.pit_out,
                    "st_speed": lap.speed_trap,
                })
        return rows

    def stint_rows(self) -> list[dict]:
        rows = []
        for number, s in self.timing.items():
            order = sorted(s.stints)
            for i, index in enumerate(order):
                stint = s.stints[index]
                lap_start = s.stint_start[index]
                last_lap = s.laps[-1].number if s.laps else None
                lap_end = s.stint_start[order[i + 1]] - 1 if i + 1 < len(order) else last_lap
                rows.append({
                    "driver_number": int(number),
                    "stint_number": index + 1,
                    "lap_start": lap_start,
                    "lap_end": lap_end,
                    "compound": stint.get("Compound"),
                    "tyre_age_at_start": stint.get("StartLaps"),
                })
        return rows

    def window(self) -> tuple[float, float] | None:
        """Lights out (or the first green light) to the last car taking the flag."""
        started = [d for d, status in self.statuses if status == "Started"]
        ends = [lap.end for s in self.timing.values() for lap in s.laps if lap.end is not None]
        if not started or not ends:
            return None
        start = started[0]
        stops = [d for d, status in self.statuses if status in ("Finished", "Aborted") and d > start]
        if stops:
            flag = stops[-1]
            end = max([flag] + [e for e in ends if flag - TAIL_MS <= e <= flag + FINISH_GRACE_MS])
        else:  # still running (or the recording is incomplete): as far as the data goes
            end = max(ends)
        return start - LEAD_IN_MS, end + TAIL_MS

    def finish(self) -> dict:
        self._apply_deletions()
        if self.is_race:
            self._retirements()
        by_date = lambda row: row["date"]  # noqa: E731
        return {
            "window": self.window(),
            "drivers": self.driver_rows(),
            "positions": sorted(self.positions, key=by_date),
            "intervals": sorted(self.intervals, key=by_date),
            "race_control": sorted(self.race_control, key=by_date),
            "laps": sorted(self.lap_rows(), key=lambda r: (r["driver_number"], r["lap_number"])),
            "stints": sorted(self.stint_rows(), key=lambda r: (r["driver_number"], r["stint_number"])),
            "weather": sorted(self.weather, key=by_date),
            "track_status": sorted(self.track_status, key=by_date),
            "pits": sorted(self.pits.values(), key=by_date),
            "grid": sorted(({"driver_number": d, "position": p} for d, p in self.grid.items()), key=lambda r: r["position"]),
            "retirements": sorted(self.retirements, key=by_date),
            # Started / Aborted / Inactive / Finished / Finalised / Ends. A restart after a red flag is
            # the next "Started": the track status clears long before the session resumes.
            "session_status": [{"date": d, "status": s} for d, s in sorted(self.statuses)],
            # Qualifying: F1 flags each driver as the part they went out in ends.
            "knockouts": sorted(({"date": t, "driver_number": d} for d, t in self.knockouts.items()), key=by_date),
        }
