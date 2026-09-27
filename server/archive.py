"""F1's static live-timing archive: every session's feed, recorded topic by topic.

Each topic is a `.jsonStream` file of lines like `00:56:53.247{"...": ...}`: an
offset from the start of the recording, then the same JSON frame the live
SignalR feed sent at that moment.
"""

import base64
import json
import time
import zlib
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import requests

BASE = "https://livetiming.formula1.com/static/"
SEASON_TTL_S = 300

_http = requests.Session()
_http.headers["User-Agent"] = "BestHTTP"
_seasons: dict[int, tuple[float, list["SessionMeta"]]] = {}


@dataclass(frozen=True)
class SessionMeta:
    key: int
    path: str
    row: dict  # shaped like lib/telemetry/types.ts `Session`


def _get(path: str) -> requests.Response | None:
    res = _http.get(BASE + path, timeout=60)
    if res.status_code in (403, 404):
        return None
    res.raise_for_status()
    return res


def get_json(path: str):
    res = _get(path)
    return json.loads(res.content.decode("utf-8-sig")) if res else None


def _offset_ms(text: str) -> float:
    hours, minutes, seconds = text.split(":")
    return (int(hours) * 3600 + int(minutes) * 60 + float(seconds)) * 1000


def stream(path: str, topic: str) -> list[tuple[float, object]]:
    """A topic's frames as (offset ms, payload); empty when the session has no such feed."""
    res = _get(f"{path}{topic}.jsonStream")
    if res is None:
        return []
    frames = []
    for line in res.content.decode("utf-8-sig").splitlines():
        if len(line) > 12:
            frames.append((_offset_ms(line[:12]), json.loads(line[12:])))
    return frames


def decompress(payload: str) -> dict:
    """`.z` topics: base64 of raw-deflated JSON."""
    return json.loads(zlib.decompress(base64.b64decode(payload), -zlib.MAX_WBITS))


def is_complete(path: str) -> bool:
    status = get_json(f"{path}ArchiveStatus.json")
    return isinstance(status, dict) and status.get("Status") == "Complete"


def _utc(local: str, gmt_offset: str) -> str:
    """Index dates are circuit-local; GmtOffset is like "04:00:00" or "-05:00:00"."""
    sign = -1 if gmt_offset.startswith("-") else 1
    hours, minutes, seconds = (int(part) for part in gmt_offset.lstrip("+-").split(":"))
    offset = timedelta(hours=hours, minutes=minutes, seconds=seconds) * sign
    return (datetime.fromisoformat(local) - offset).replace(tzinfo=timezone.utc).isoformat()


def season(year: int) -> list[SessionMeta]:
    """Every session in the year's archive index, oldest first."""
    cached = _seasons.get(year)
    if cached and time.monotonic() - cached[0] < SEASON_TTL_S:
        return cached[1]

    index = get_json(f"{year}/Index.json") or {}
    sessions = []
    for meeting in index.get("Meetings", []):
        for s in meeting.get("Sessions", []):
            if s.get("Key", -1) < 0 or not s.get("Path"):
                continue
            offset = s.get("GmtOffset", "00:00:00")
            sessions.append(SessionMeta(s["Key"], s["Path"], {
                "session_key": s["Key"],
                "session_type": s.get("Type", ""),
                "session_name": s.get("Name", ""),
                "date_start": _utc(s["StartDate"], offset),
                "date_end": _utc(s["EndDate"], offset),
                "meeting_key": meeting.get("Key"),
                "circuit_key": meeting.get("Circuit", {}).get("Key"),
                "circuit_short_name": meeting.get("Circuit", {}).get("ShortName", ""),
                "country_code": meeting.get("Country", {}).get("Code", ""),
                "country_name": meeting.get("Country", {}).get("Name", ""),
                "location": meeting.get("Location", ""),
                "year": year,
                "is_cancelled": False,
            }))
    sessions.sort(key=lambda m: m.row["date_start"])
    _seasons[year] = (time.monotonic(), sessions)
    return sessions
