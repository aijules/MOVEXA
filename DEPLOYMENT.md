# MOVEXA local and production configuration

## Local development

Copy each local example to `.env` in the same folder, then keep using the existing commands:

```text
backend/                 npm run dev       (port 5000)
frontend/                npm run dev       (port 5173)
dashbaord/frontend/      npm run dev       (port 5174)
ussd/                    npm run dev       (ports 6000–6002)
```

The Vite apps keep their localhost API proxies. The USSD simulator can also be
started alone and will start its local backend when port 6000 is unavailable.

## Production

Copy each `.env.production.example` to `.env.production` (or configure the same
keys in the deployment platform) and replace every placeholder value:

- `frontend/.env.production.example`
- `dashbaord/frontend/.env.production.example`
- `backend/.env.production.example`
- `dashbaord/.env.production.example` (legacy standalone admin backend)
- `ussd/.env.production.example`

Build commands:

```text
backend/                 npm run build
frontend/                npm run build
dashbaord/backend/       npm run build
dashbaord/frontend/      npm run build
ussd/                    npm run build
```

Frontend artifacts are written to each frontend's `dist` directory. The USSD
command creates `ussd/dist` with the backend, simulator, dashboard, and production
environment template. Never commit real service-role, JWT, or payment credentials.

## If the deployed app opens but has no routes or search results

The passenger frontend is running, but it cannot reach the backend. Deploy the
`backend` service first, then set these variables on the frontend hosting service
before rebuilding:

```text
VITE_API_BASE_URL=https://movexa-ogo5.onrender.com
VITE_SOCKET_URL=https://movexa-ogo5.onrender.com
```

Do not use `localhost` in a production frontend variable. Variables prefixed
with `VITE_` are embedded during `npm run build`, so changing them requires a new
frontend deployment. For an installed iOS PWA, close and reopen it afterward.
If an old build persists, remove the home-screen app, clear that site's Safari
data, and install it again.
