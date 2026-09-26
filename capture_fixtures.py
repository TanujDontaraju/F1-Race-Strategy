"""Capture real OpenF1 + MultiViewer responses as mock fixtures for the frontend."""
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

OPENF1 = "https://api.openf1.org/v1"
MULTIVIEWER = "https://api.multiviewer.app/api/v1"
OUT = sys.argv[1]

SESSIONS = [
    # Monza race, a ~100s window around lap 20 (includes one full lap for driver 1)
    {"session_key": 11361, "circuit_key": 39, "year": 2026,
     "start": "2026-09-06T14:05:55", "end": "2026-09-06T14:07:35"},
    # Baku qualifying (today), the final ~100s of Q2 as the last flying laps complete
    {"session_key": 11373, "circuit_key": 144, "year": 2026,
     "start": "2026-09-25T12:41:30", "end": "2026-09-25T12:43:10"},
]


def fetch(url):
    time.sleep(0.5)  # stay well under the free tier's 3 req/s
    req = urllib.request.Request(url, headers={"User-Agent": "f1-race-strategy-dev-fixtures"})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return []
        raise


def openf1(endpoint, params, filters=()):
    query = urllib.parse.urlencode(params)
    for f in filters:
        query += "&" + f
    url = f"{OPENF1}/{endpoint}?{query}"
    rows = fetch(url)
    print(f"  {endpoint}: {len(rows)} rows")
    return rows


def write(path, data):
    full = os.path.join(OUT, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "w", encoding="utf-8") as f:
        json.dump(data, f, separators=(",", ":"))
    print(f"  -> {path} ({os.path.getsize(full) // 1024} KB)")


def gt(field, value):
    return f"{field}%3E{value}"


def lt(field, value):
    return f"{field}%3C{value}"


print("sessions (2026)")
write("sessions-2026.json", openf1("sessions", {"year": 2026}))

for s in SESSIONS:
    key, start, end = s["session_key"], s["start"], s["end"]
    print(f"session {key}")
    base = {"session_key": key}
    write(f"{key}/drivers.json", openf1("drivers", base))
    write(f"{key}/position.json", openf1("position", base, [lt("date", end)]))
    # a little before the window so the leaderboard has state at the first frame
    interval_start = start[:-2] + "%02d" % max(int(start[-2:]) - 15, 0)
    write(f"{key}/intervals.json", openf1("intervals", base, [gt("date", interval_start), lt("date", end)]))
    write(f"{key}/stints.json", openf1("stints", base))
    write(f"{key}/laps.json", openf1("laps", base, [lt("date_start", end)]))
    write(f"{key}/race_control.json", openf1("race_control", base, [lt("date", end)]))
    write(f"{key}/location.json", openf1("location", base, [gt("date", start), lt("date", end)]))
    write(f"{key}/car_data.json", openf1("car_data", base, [gt("date", start), lt("date", end)]))
    write(f"{key}/meta.json", {"session_key": key, "circuit_key": s["circuit_key"], "year": s["year"],
                               "window": {"start": start + "+00:00", "end": end + "+00:00"}})

    print(f"circuit {s['circuit_key']}/{s['year']}")
    circuit = fetch(f"{MULTIVIEWER}/circuits/{s['circuit_key']}/{s['year']}")
    write(f"circuits/{s['circuit_key']}-{s['year']}.json", circuit)
