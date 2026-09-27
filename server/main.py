"""Telemetry API for the pit wall frontend.

Rows match lib/telemetry/types.ts; time filters are epoch milliseconds.
A plain WSGI app, so it runs on PythonAnywhere. Locally, from the project root:
    server/.venv/Scripts/python -m flask --app server.main run --port 8000
"""

import gzip
import json
import os

from flask import Flask, Response, abort, request
from werkzeug.exceptions import HTTPException

from server import sessions
from server.sessions import SessionData

# Comma-separated sites allowed to call this API, e.g. the deployed frontend's URL.
ALLOWED_ORIGINS = {
    origin.strip().rstrip("/")
    for origin in os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",")
    if origin.strip()
}
GZIP_MIN_BYTES = 1024

app = Flask(__name__)


@app.after_request
def cors_and_gzip(response: Response) -> Response:
    origin = request.headers.get("Origin")
    if origin in ALLOWED_ORIGINS:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.vary.add("Origin")

    # The location and car_data slices are large and shrink ~10x.
    if (
        response.status_code == 200
        and not response.direct_passthrough
        and "gzip" in request.headers.get("Accept-Encoding", "")
        and "Content-Encoding" not in response.headers
    ):
        body = response.get_data()
        if len(body) >= GZIP_MIN_BYTES:
            response.set_data(gzip.compress(body, compresslevel=5))
            response.headers["Content-Encoding"] = "gzip"
            response.vary.add("Accept-Encoding")
    return response


@app.errorhandler(HTTPException)
def json_error(error: HTTPException) -> Response:
    return Response(json.dumps({"detail": error.description}), error.code, mimetype="application/json")


def _json(data) -> Response:
    return Response(json.dumps(data, separators=(",", ":")), mimetype="application/json")


def _number(name: str, kind: type = float):
    value = request.args.get(name, type=kind)
    if value is None:
        abort(400, f"Missing or invalid query parameter: {name}")
    return value


def _session(key: int) -> SessionData:
    data = sessions.get(key)
    if data is None:
        abort(404, "No timing data for this session")
    return data


@app.get("/health")
def health():
    """Lets the frontend tell a stopped server apart from a failing request."""
    return _json({"ok": True})


@app.get("/sessions")
def list_sessions():
    return _json(sessions.list_sessions(_number("year", int)))


@app.get("/sessions/<int:key>/window")
def window(key: int):
    start, end = _session(key).window
    return _json({"start": start, "end": end})


@app.get("/sessions/<int:key>/drivers")
def drivers(key: int):
    return _json(_session(key).rows["drivers"])


@app.get("/sessions/<int:key>/stints")
def stints(key: int):
    return _json(_session(key).rows["stints"])


@app.get("/sessions/<int:key>/position")
def positions(key: int):
    return _json(_session(key).rows_before("positions", _number("to")))


@app.get("/sessions/<int:key>/laps")
def laps(key: int):
    return _json(_session(key).rows_before("laps", _number("to"), date_key="date_start"))


@app.get("/sessions/<int:key>/race_control")
def race_control(key: int):
    return _json(_session(key).rows_before("race_control", _number("to")))


@app.get("/sessions/<int:key>/weather")
def weather(key: int):
    return _json(_session(key).rows_before("weather", float("inf")))


@app.get("/sessions/<int:key>/track_status")
def track_status(key: int):
    return _json(_session(key).rows_before("track_status", float("inf")))


@app.get("/sessions/<int:key>/session_status")
def session_status(key: int):
    return _json(_session(key).rows_before("session_status", float("inf")))


@app.get("/sessions/<int:key>/pit")
def pit_stops(key: int):
    return _json(_session(key).rows_before("pits", float("inf")))


@app.get("/sessions/<int:key>/grid")
def grid(key: int):
    return _json(_session(key).rows["grid"])


@app.get("/sessions/<int:key>/knockouts")
def knockouts(key: int):
    return _json(_session(key).rows_before("knockouts", float("inf")))


@app.get("/sessions/<int:key>/retirements")
def retirements(key: int):
    return _json(_session(key).rows_before("retirements", float("inf")))


@app.get("/sessions/<int:key>/lap_telemetry")
def lap_telemetry(key: int):
    data = _session(key).lap_telemetry(_number("driver", int), _number("lap", int))
    if data is None:
        abort(404, "No telemetry for that lap")
    return _json(data)


@app.get("/sessions/<int:key>/intervals")
def intervals(key: int):
    return _json(_session(key).rows_between("intervals", _number("from"), _number("to")))


@app.get("/sessions/<int:key>/location")
def locations(key: int):
    return _json(_session(key).locations.between(_number("from"), _number("to")))


@app.get("/sessions/<int:key>/car_data")
def car_data(key: int):
    return _json(_session(key).car_data.between(_number("from"), _number("to")))
