"""Print what livef1's parsers produce for each live-timing topic.

The live client runs every SignalR message through livef1's `function_map`, and
F1's static archive is a recording of that same feed, so replaying a finished
session's archive through the parsers shows exactly what the live callback
will receive. Only the start of each stream is downloaded.

    server/.venv/Scripts/python server/inspect_topics.py [archive path] [topic ...]

Needs the dev requirements: pip install -r server/requirements-dev.txt
"""

import json
import sys

import requests
from livef1.data_processing.etl import function_map

ARCHIVE = "https://livetiming.formula1.com/static/"
DEFAULT_SESSION = "2026/2026-09-26_Azerbaijan_Grand_Prix/2026-09-26_Race/"
DEFAULT_TOPICS = [
    "SessionInfo",
    "DriverList",
    "TimingData",
    "TyreStintSeries",
    "TimingAppData",
    "RaceControlMessages",
    "Position.z",
    "CarData.z",
    "LapCount",
    "TrackStatus",
    "WeatherData",
]
# Lines to read per topic: enough to see delta vocabulary without downloading whole streams.
LINE_LIMIT = {"Position.z": 20, "CarData.z": 20}
DEFAULT_LINES = 400


def read_stream(session_path: str, topic: str, limit: int) -> list[tuple[str, object]]:
    url = f"{ARCHIVE}{session_path}{topic}.jsonStream"
    rows = []
    with requests.get(url, stream=True, timeout=30, headers={"User-Agent": "BestHTTP"}) as res:
        if res.status_code != 200:
            print(f"  HTTP {res.status_code} for {url}")
            return rows
        for raw in res.iter_lines():
            line = raw.decode("utf-8-sig").lstrip("﻿")
            if not line:
                continue
            # Each line: a 12-character session offset ("00:01:23.456") then the JSON payload.
            rows.append((line[:12], json.loads(line[12:])))
            if len(rows) >= limit:
                break
    return rows


def show(topic: str, rows: list[tuple[str, object]]) -> None:
    print(f"\n=== {topic}: {len(rows)} raw lines")
    if not rows:
        return
    parser = function_map.get(topic)
    if parser is None:
        first = rows[0][1]
        print("  no livef1 parser; raw top-level keys:", list(first)[:20] if isinstance(first, dict) else type(first))
        print("  raw sample:", json.dumps(first)[:700])
        return

    records = list(parser(rows, None))
    keys: set[str] = set()
    for record in records:
        keys.update(record)
    print(f"  {len(records)} parsed records; keys seen:")
    print("  ", sorted(keys))
    for record in records[:2]:
        print("  sample:", json.dumps(record, default=str)[:700])


def main() -> None:
    session_path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_SESSION
    topics = sys.argv[2:] or DEFAULT_TOPICS
    print("Session archive:", session_path)
    for topic in topics:
        show(topic, read_stream(session_path, topic, LINE_LIMIT.get(topic, DEFAULT_LINES)))


if __name__ == "__main__":
    main()
