"""Telemetry API for the pit wall frontend.

Rows match lib/telemetry/types.ts; time filters are epoch milliseconds.
Run from the project root:
    server/.venv/Scripts/python -m uvicorn server.main:app --port 8000
"""

import json
import os
from pathlib import Path

import requests
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import Response

from server import sessions
from server.sessions import CACHE_DIR, SessionData

MULTIVIEWER = "https://api.multiviewer.app/api/v1/circuits"
# Comma-separated sites allowed to call this API, e.g. the deployed frontend's URL.
ALLOWED_ORIGINS = os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")

app = FastAPI(title="Pit wall telemetry")
app.add_middleware(GZipMiddleware, minimum_size=1024)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip().rstrip("/") for origin in ALLOWED_ORIGINS.split(",") if origin.strip()],
    allow_methods=["GET"],
    allow_headers=["*"],
)


def _json(data) -> Response:
    # Bypasses FastAPI's per-field encoder, which is slow on thousands of rows.
    return Response(json.dumps(data, separators=(",", ":")), media_type="application/json")


def _session(key: int) -> SessionData:
    data = sessions.get(key)
    if data is None:
        raise HTTPException(404, "No timing data for this session")
    return data


@app.get("/health")
def health():
    """Lets the frontend tell a stopped server apart from a failing request."""
    return {"ok": True}


@app.get("/sessions")
def list_sessions(year: int):
    return _json(sessions.list_sessions(year))


@app.get("/sessions/{key}/window")
def window(key: int):
    start, end = _session(key).window
    return _json({"start": start, "end": end})


@app.get("/sessions/{key}/drivers")
def drivers(key: int):
    return _json(_session(key).rows["drivers"])


@app.get("/sessions/{key}/stints")
def stints(key: int):
    return _json(_session(key).rows["stints"])


@app.get("/sessions/{key}/position")
def positions(key: int, to: float):
    return _json(_session(key).rows_before("positions", to))


@app.get("/sessions/{key}/laps")
def laps(key: int, to: float):
    return _json(_session(key).rows_before("laps", to, date_key="date_start"))


@app.get("/sessions/{key}/race_control")
def race_control(key: int, to: float):
    return _json(_session(key).rows_before("race_control", to))


@app.get("/sessions/{key}/weather")
def weather(key: int):
    return _json(_session(key).rows_before("weather", float("inf")))


@app.get("/sessions/{key}/track_status")
def track_status(key: int):
    return _json(_session(key).rows_before("track_status", float("inf")))


@app.get("/sessions/{key}/session_status")
def session_status(key: int):
    return _json(_session(key).rows_before("session_status", float("inf")))


@app.get("/sessions/{key}/pit")
def pit_stops(key: int):
    return _json(_session(key).rows_before("pits", float("inf")))


@app.get("/sessions/{key}/grid")
def grid(key: int):
    return _json(_session(key).rows["grid"])


@app.get("/sessions/{key}/knockouts")
def knockouts(key: int):
    return _json(_session(key).rows_before("knockouts", float("inf")))


@app.get("/sessions/{key}/retirements")
def retirements(key: int):
    return _json(_session(key).rows_before("retirements", float("inf")))


@app.get("/sessions/{key}/lap_telemetry")
def lap_telemetry(key: int, driver: int, lap: int):
    data = _session(key).lap_telemetry(driver, lap)
    if data is None:
        raise HTTPException(404, "No telemetry for that lap")
    return _json(data)


@app.get("/sessions/{key}/intervals")
def intervals(key: int, start: float = Query(alias="from"), end: float = Query(alias="to")):
    return _json(_session(key).rows_between("intervals", start, end))


@app.get("/sessions/{key}/location")
def locations(key: int, start: float = Query(alias="from"), end: float = Query(alias="to")):
    return _json(_session(key).locations.between(start, end))


@app.get("/sessions/{key}/car_data")
def car_data(key: int, start: float = Query(alias="from"), end: float = Query(alias="to")):
    return _json(_session(key).car_data.between(start, end))


@app.get("/circuits/{circuit_key}/{year}")
def circuit(circuit_key: int, year: int):
    """MultiViewer's track outline, cached on disk. 404s for circuits it doesn't know yet."""
    path: Path = CACHE_DIR / "circuits" / f"{circuit_key}-{year}.json"
    if not path.exists():
        res = requests.get(f"{MULTIVIEWER}/{circuit_key}/{year}", timeout=30,
                           headers={"User-Agent": "f1-pit-wall"})
        if res.status_code == 404:
            raise HTTPException(404, "Unknown circuit")
        res.raise_for_status()
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(res.content)
    return Response(path.read_bytes(), media_type="application/json")
