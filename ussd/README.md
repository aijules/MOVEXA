# MOVEXA USSD Ecosystem

A **dedicated, independent** USSD module for the MOVEXA Smart Public Transport
System. It runs as its own set of services with their own ports, while
**reusing the existing MOVEXA Supabase database** and **never modifying** any
existing MOVEXA functionality, API, UI or schema.

```
ussd/
├── backend/      USSD backend service        → http://localhost:6000
├── simulator/    Browser phone simulator     → http://localhost:6001
├── dashboard/    USSD management dashboard    → http://localhost:6002
├── db/schema.sql Additive tables (run once)
├── .env          Supabase credentials + ports
└── start-all.js  Launch all three at once
```

## Why zero-dependency?

All three services use only Node's built-in modules (`http`, `fs`,
`child_process`) and native `fetch` (Node 18+) against the Supabase REST API.
**No `npm install` is required** — clone and run.

## Prerequisites

- Node.js **18 or newer** (`node -v`)
- The existing MOVEXA `backend/.env` with valid `SUPABASE_URL` and
  `SUPABASE_SERVICE_ROLE_KEY` (already mirrored into `ussd/.env`).

## 1. (Once) Create the additive tables

Open the Supabase SQL editor and run [`db/schema.sql`](db/schema.sql). It
creates **only new** tables — `ussd_sessions`, `ussd_feedback`,
`ussd_analytics` (and `ussd_requests` if it does not already exist). It does
**not** touch any existing MOVEXA table.

> The services run fine even before this step — session tracking and feedback
> simply degrade gracefully until the tables exist.

## 2. Run

```bash
cd ussd
node start-all.js          # starts backend + simulator + dashboard together
```

or run each independently in its own terminal:

```bash
node backend/server.js     # :6000  USSD backend / gateway
node simulator/server.js   # :6001  phone simulator
node dashboard/server.js   # :6002  management dashboard
```

Then open:

| Service          | URL                     |
|------------------|-------------------------|
| USSD Simulator   | http://localhost:6001   |
| USSD Dashboard   | http://localhost:6002   |
| USSD Backend API | http://localhost:6000   |

## USSD menu

Dial **`*384*45343#`** (or `*384*MOVEXA#`, or any custom code) in the simulator:

```
Welcome to MOVEXA
1. Check Bus ETA      → boarding stop → destination → ETA, delay, next buses
2. Journey Planner    → origin → destination → routes, travel time, fare
3. Service Alerts     → live incidents (traffic, delays, closures)
4. Fare Information   → route code → fare & trip cost
5. Nearby Stops       → area/stop name → nearby stops
6. Saved Journeys     → your recent ETA/journey searches
7. About MOVEXA
```

## Backend API

| Method | Path             | Purpose                                         |
|--------|------------------|-------------------------------------------------|
| POST   | `/ussd`          | Africa's Talking-compatible gateway (CON/END)   |
| POST   | `/api/ussd`      | Alias of `/ussd`                                |
| GET    | `/api/health`    | Service status + configured codes               |
| GET    | `/api/config`    | Supported service codes                         |
| GET    | `/api/analytics` | KPIs, peak hours, popular routes/stops, menu use |
| GET    | `/api/sessions`  | Recent sessions with status                     |
| GET    | `/api/logs`      | Request log                                     |
| GET    | `/api/feedback`  | Passenger feedback                              |
| POST   | `/api/feedback`  | Submit feedback `{message, rating, ...}`        |

### Africa's Talking compatibility

The `/ussd` endpoint accepts both JSON and `x-www-form-urlencoded` bodies with
the standard fields `sessionId`, `phoneNumber`, `serviceCode`, `text`, and
replies with `text/plain` prefixed `CON ` / `END ` — so it can be pointed at by
a real Africa's Talking USSD callback without code changes.

## Data model (additive only)

- **`ussd_logs`** — one row per interaction (the request log).
- **`ussd_sessions`** — one row per session (`active` / `completed` / `failed`
  / `timeout`), updated as the dialog progresses.
- **`ussd_feedback`** — passenger feedback captured via USSD.
- **`ussd_analytics`** — optional daily rollups (dashboard computes live).

> All four are **new** tables. The legacy `ussd_requests` table (if it exists
> in your project) is intentionally left untouched.

Existing MOVEXA tables (`routes`, `stops`, `route_stops`, `schedules`,
`incidents`, `trips`) are read **only** for lookups — never written.

## Ports

| Service            | Port | Configurable via            |
|--------------------|------|-----------------------------|
| USSD Backend       | 6000 | `USSD_PORT`                 |
| USSD Simulator     | 6001 | `USSD_SIMULATOR_PORT`       |
| USSD Dashboard     | 6002 | `USSD_DASHBOARD_PORT`       |

(The passenger app `:5173`, main backend `:5000` and staff dashboard remain
untouched and run independently.)
