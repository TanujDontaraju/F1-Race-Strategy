# F1 Pit Wall

A live-timing telemetry dashboard for Formula 1 sessions: track map, lap times, tire strategy, and
car telemetry, replayed from F1's own timing archive.

- **Frontend:** Next.js (React), in `app/`, `components/`, `lib/`
- **API:** Flask, in `server/` — rebuilds a session from F1's live-timing archive and caches it
- **Deployment:** frontend on Vercel, API on PythonAnywhere (see `deploy/pythonanywhere/`)

## Running locally

**Frontend:**
```bash
npm install
npm run dev
```
Opens at `http://localhost:3000`.

**API** (separate terminal, needed for real data):
```bash
cd server
python -m venv .venv
.venv/Scripts/activate   # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
python -m flask --app main run --port 8000
```

Without the API running, set `NEXT_PUBLIC_TELEMETRY_SOURCE=mock` to use the small bundled fixtures
in `public/mock/telemetry` instead.
