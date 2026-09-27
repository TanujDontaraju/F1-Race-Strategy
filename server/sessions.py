"""Full sessions built from F1's archive, cached, and sliced by time for the frontend."""

import json
import os
import statistics
import threading
import time
from collections import OrderedDict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

from server import archive
from server.mapping import FeedMapper, iso, parse_utc

# Bump when mapping changes, so stale caches are rebuilt rather than served.
CACHE_VERSION = 4
# A host can point CACHE_DIR at a persistent volume so rebuilt sessions survive redeploys.
CACHE_DIR = Path(os.environ.get("CACHE_DIR") or Path(__file__).parent / "cache") / f"v{CACHE_VERSION}"
MEMORY_SESSIONS = 4
# High-frequency data kept either side of the replay window.
SAMPLE_MARGIN_MS = 60_000
# Position samples taken either side of a lap, to place its start and end exactly.
LAP_EDGE_MS = 2_000

# Low-frequency topics, fed to the mapper in time order (ties in this order).
TOPICS = (
    "SessionInfo", "SessionData", "DriverList", "TimingData", "TimingAppData", "TyreStintSeries",
    "PitLaneTimeCollection", "PitStopSeries", "RaceControlMessages", "WeatherData",
)
ROW_KEYS = (
    "drivers", "positions", "intervals", "race_control", "laps", "stints",
    "weather", "track_status", "pits", "grid", "retirements", "session_status", "knockouts",
)


@dataclass
class Samples:
    """Columns of timestamped per-car samples, sorted by time."""

    t: np.ndarray
    columns: dict[str, np.ndarray]

    def between(self, start: float, end: float) -> list[dict]:
        lo, hi = np.searchsorted(self.t, [start, end], side="left")
        names = list(self.columns)
        values = [self.columns[name][lo:hi].tolist() for name in names]
        return [
            {"date": iso(t), **dict(zip(names, row))}
            for t, row in zip(self.t[lo:hi].tolist(), zip(*values))
        ]

    def of(self, driver: int, start: float, end: float) -> dict[str, np.ndarray]:
        """One car's samples in [start, end], as columns plus "t"."""
        lo = np.searchsorted(self.t, start, side="left")
        hi = np.searchsorted(self.t, end, side="right")
        mask = self.columns["driver_number"][lo:hi] == driver
        return {"t": self.t[lo:hi][mask]} | {name: col[lo:hi][mask] for name, col in self.columns.items()}


@dataclass
class SessionData:
    key: int
    window: tuple[float, float]
    rows: dict[str, list[dict]]
    locations: Samples
    car_data: Samples

    def rows_before(self, name: str, end: float, date_key: str = "date") -> list[dict]:
        return [_serialise(r) for r in self.rows[name] if r[date_key] is not None and r[date_key] < end]

    def rows_between(self, name: str, start: float, end: float) -> list[dict]:
        return [_serialise(r) for r in self.rows[name] if start <= r["date"] < end]

    def lap_telemetry(self, driver: int, lap: int) -> dict | None:
        """One lap's car data against distance travelled, for comparing laps side by side."""
        laps = sorted((r for r in self.rows["laps"] if r["driver_number"] == driver), key=lambda r: r["lap_number"])
        row = next((r for r in laps if r["lap_number"] == lap), None)
        if row is None or row["date_start"] is None:
            return None
        start = row["date_start"]
        if row["lap_duration"]:
            end = start + row["lap_duration"] * 1000
        else:  # deleted laps have no duration; they still ran until the next lap began
            following = next((r for r in laps if r["lap_number"] > lap and r["date_start"]), None)
            if following is None:
                return None
            end = following["date_start"]

        # Samples arrive ~4 times a second, so none sits on the timing line: take a
        # little either side and interpolate where the car was as the lap began and ended.
        loc = self.locations.of(driver, start - LAP_EDGE_MS, end + LAP_EDGE_MS)
        car = self.car_data.of(driver, start, end)
        if len(loc["t"]) < 2 or len(car["t"]) < 2 or loc["t"][0] > start or loc["t"][-1] < end:
            return None
        # Positions are in decimetres; distance is measured along the sampled path.
        step = np.hypot(np.diff(loc["x"]), np.diff(loc["y"])) / 10
        travelled = np.concatenate([[0.0], np.cumsum(step)])
        origin = np.interp(start, loc["t"], travelled)
        length = float(np.interp(end, loc["t"], travelled) - origin)
        inside = (loc["t"] > start) & (loc["t"] < end)
        path_distance = np.concatenate([[0.0], travelled[inside] - origin, [length]])
        path_time = np.concatenate([[0.0], (loc["t"][inside] - start) / 1000, [(end - start) / 1000]])
        car_distance = np.interp(car["t"], loc["t"], travelled) - origin
        return {
            "driver_number": driver,
            "lap_number": lap,
            "lap_duration": row["lap_duration"],
            "length": round(length, 1),
            "car": {
                "distance": np.round(car_distance, 1).tolist(),
                "speed": car["speed"].tolist(),
                "throttle": car["throttle"].tolist(),
                "brake": car["brake"].tolist(),
                "n_gear": car["n_gear"].tolist(),
                "rpm": car["rpm"].tolist(),
            },
            # Seconds into the lap at each point along it, for timing mini-sectors.
            "path": {
                "distance": np.round(path_distance, 1).tolist(),
                "time": np.round(path_time, 3).tolist(),
            },
        }


def _serialise(row: dict) -> dict:
    return {k: iso(v) if k in ("date", "date_start") and v is not None else v for k, v in row.items()}


def _reference_ms(frames: list[tuple[float, int, str, object]]) -> float | None:
    """Wall-clock time of offset zero, from frames that carry their own UTC stamp."""
    estimates = []
    for offset, _, topic, payload in frames:
        if topic != "SessionData" or offset == 0 or not isinstance(payload, dict):
            continue  # offset-zero frames are snapshots whose stamps predate the recording
        for series in ("Series", "StatusSeries"):
            container = payload.get(series)
            items = container.values() if isinstance(container, dict) else container or []
            estimates += [parse_utc(e["Utc"]) - offset for e in items if isinstance(e, dict) and e.get("Utc")]
    return statistics.median(estimates) if estimates else None


def _locations(frames, start: float, end: float) -> Samples:
    t, driver, x, y, z = [], [], [], [], []
    for _, payload in frames:
        if not isinstance(payload, str):
            continue
        for sample in archive.decompress(payload).get("Position", []):
            ms = parse_utc(sample["Timestamp"])
            if not start <= ms <= end:
                continue
            for number, e in sample.get("Entries", {}).items():
                t.append(ms)
                driver.append(int(number))
                x.append(e.get("X", 0))
                y.append(e.get("Y", 0))
                z.append(e.get("Z", 0))
    order = np.argsort(np.asarray(t, dtype=np.float64), kind="stable")
    return Samples(np.asarray(t, dtype=np.float64)[order], {
        "driver_number": np.asarray(driver, dtype=np.int16)[order],
        "x": np.asarray(x, dtype=np.int32)[order],
        "y": np.asarray(y, dtype=np.int32)[order],
        "z": np.asarray(z, dtype=np.int32)[order],
    })


def _car_data(frames, start: float, end: float) -> Samples:
    t, driver, rpm, speed, gear, throttle, brake = [], [], [], [], [], [], []
    for _, payload in frames:
        if not isinstance(payload, str):
            continue
        for entry in archive.decompress(payload).get("Entries", []):
            ms = parse_utc(entry["Utc"])
            if not start <= ms <= end:
                continue
            for number, car in entry.get("Cars", {}).items():
                channels = car.get("Channels", {})
                t.append(ms)
                driver.append(int(number))
                rpm.append(channels.get("0", 0))
                speed.append(channels.get("2", 0))
                gear.append(channels.get("3", 0))
                throttle.append(channels.get("4", 0))
                brake.append(channels.get("5", 0))
    order = np.argsort(np.asarray(t, dtype=np.float64), kind="stable")
    return Samples(np.asarray(t, dtype=np.float64)[order], {
        "driver_number": np.asarray(driver, dtype=np.int16)[order],
        "rpm": np.asarray(rpm, dtype=np.int32)[order],
        "speed": np.asarray(speed, dtype=np.int16)[order],
        "n_gear": np.asarray(gear, dtype=np.int16)[order],
        "throttle": np.asarray(throttle, dtype=np.int16)[order],
        "brake": np.asarray(brake, dtype=np.int16)[order],
    })


def build(meta: archive.SessionMeta) -> SessionData | None:
    """Replay a session's archive through the mapper. None if it has no timing data yet."""
    frames = [
        (offset, order, topic, payload)
        for order, topic in enumerate(TOPICS)
        for offset, payload in archive.stream(meta.path, topic)
    ]
    frames.sort(key=lambda f: (f[0], f[1]))
    reference = _reference_ms(frames)
    if reference is None:
        return None

    mapper = FeedMapper()
    for offset, _, topic, payload in frames:
        mapper.apply(topic, payload, reference + offset)
    result = mapper.finish()
    if result["window"] is None:
        return None

    start, end = result["window"]
    lo, hi = start - SAMPLE_MARGIN_MS, end + SAMPLE_MARGIN_MS
    return SessionData(
        key=meta.key,
        window=result["window"],
        rows={name: result[name] for name in ROW_KEYS},
        locations=_locations(archive.stream(meta.path, "Position.z"), lo, hi),
        car_data=_car_data(archive.stream(meta.path, "CarData.z"), lo, hi),
    )


# --- disk cache -----------------------------------------------------------

def _paths(key: int) -> tuple[Path, Path]:
    folder = CACHE_DIR / "sessions"
    return folder / f"{key}.json", folder / f"{key}.npz"


def _save(data: SessionData) -> None:
    rows_path, samples_path = _paths(data.key)
    rows_path.parent.mkdir(parents=True, exist_ok=True)
    rows_path.write_text(json.dumps({"window": data.window, "rows": data.rows}, separators=(",", ":")))
    arrays = {f"loc_{k}": v for k, v in data.locations.columns.items()} | {"loc_t": data.locations.t}
    arrays |= {f"car_{k}": v for k, v in data.car_data.columns.items()} | {"car_t": data.car_data.t}
    np.savez_compressed(samples_path, **arrays)


def _load(key: int) -> SessionData | None:
    rows_path, samples_path = _paths(key)
    if not rows_path.exists() or not samples_path.exists():
        return None
    saved = json.loads(rows_path.read_text())
    with np.load(samples_path) as arrays:
        def samples(prefix: str) -> Samples:
            columns = {k[len(prefix):]: arrays[k] for k in arrays.files if k.startswith(prefix) and k != f"{prefix}t"}
            return Samples(arrays[f"{prefix}t"], columns)
        return SessionData(key, tuple(saved["window"]), saved["rows"], samples("loc_"), samples("car_"))


# --- lookup ---------------------------------------------------------------

# key → (session, monotonic expiry). Finished recordings never expire; partial ones are rebuilt.
_memory: "OrderedDict[int, tuple[SessionData | None, float | None]]" = OrderedDict()
_memory_lock = threading.Lock()
_build_locks: dict[int, threading.Lock] = {}
PARTIAL_TTL_S = 300


def list_sessions(year: int) -> list[dict]:
    now = datetime.now(timezone.utc).isoformat()
    return [m.row for m in archive.season(year) if m.row["date_start"] <= now]


def _meta(key: int) -> archive.SessionMeta | None:
    year = datetime.now(timezone.utc).year
    for candidate in (year, year - 1):
        for meta in archive.season(candidate):
            if meta.key == key:
                return meta
    return None


def _cached(key: int) -> tuple[bool, SessionData | None]:
    entry = _memory.get(key)
    if entry is None or (entry[1] is not None and time.monotonic() > entry[1]):
        return False, None
    _memory.move_to_end(key)
    return True, entry[0]


def get(key: int) -> SessionData | None:
    with _memory_lock:
        hit, data = _cached(key)
        if hit:
            return data
        lock = _build_locks.setdefault(key, threading.Lock())

    # One build per session; concurrent requests for it wait here and then hit memory.
    with lock:
        with _memory_lock:
            hit, data = _cached(key)
            if hit:
                return data
        data = _load(key)
        expiry = None
        if data is None:
            meta = _meta(key)
            data = build(meta) if meta else None
            # Only a finished recording is final; anything else is rebuilt after a while.
            if data is not None and meta and archive.is_complete(meta.path):
                _save(data)
            else:
                expiry = time.monotonic() + PARTIAL_TTL_S
        with _memory_lock:
            _memory[key] = (data, expiry)
            while len(_memory) > MEMORY_SESSIONS:
                _memory.popitem(last=False)
        return data
