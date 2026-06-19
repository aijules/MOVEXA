# Movexa Admin Dashboard

Full-stack admin dashboard for the Movexa public transport prototype.

## Stack

- Frontend: Vue 3, Vite, Pinia, Vue Router, Leaflet, PWA manifest
- Backend: Node.js, Express, JWT auth, RBAC, Excel import pipeline, optional MongoDB/Mongoose models
- Data: `data/Routes/*.xlsx` and `data/ECOFLEET_*.xlsx`

## Local demo

```bash
npm install
npm run dev
```

Open `http://localhost:5173/admin/login`.

Default development login:

- Email: `admin@example.com`
- Password: `ChangeMe123!`

Backend API health:

```bash
curl http://localhost:4000/api/admin/overview/health
```

## Notes

The API loads and normalizes the provided Excel files at startup into an in-memory data store so the dashboard works without a local MongoDB. Mongoose models are included for the production MongoDB path described in the prompts.
