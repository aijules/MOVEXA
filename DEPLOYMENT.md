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
