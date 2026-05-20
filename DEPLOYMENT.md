# e-Sheet — Deployment Guide

The system has two parts, deployed separately:

| Part            | Stack                                  | Output                     |
| --------------- | -------------------------------------- | -------------------------- |
| `esheet-backend`  | Node.js + Express + Prisma + PostgreSQL | Long-running API server    |
| `esheet-frontend` | React + Vite + Tailwind                 | Static files (`dist/`)     |

---

## 1. Prerequisites (on the server)

- **Node.js 20+**
- **PostgreSQL 14+**
- A process manager — **pm2** or a **systemd** service (do NOT use `nodemon` in production)
- A web server / reverse proxy — **nginx** or **Caddy** — for HTTPS and serving the frontend

---

## 2. Backend (`esheet-backend`)

1. **Get the code & install** (run a fresh install on the server — do not copy `node_modules` from another OS):
   ```bash
   npm install
   ```

2. **Configure environment** — copy `.env.example` to `.env` and fill in:
   - `DATABASE_URL` — the production Postgres connection string
   - `JWT_SECRET` — a long random string (`openssl rand -hex 32`)
   - `PORT` — e.g. `5000`
   - `CORS_ORIGINS` — the public frontend URL, e.g. `https://esheet.your-domain.com`

3. **Apply database migrations:**
   ```bash
   npx prisma migrate deploy
   npx prisma generate
   ```

4. **Seed required data** — labs, test standards, and user accounts:
   ```bash
   npx prisma db seed     # or: node prisma/seed.js
   ```
   > `POST /api/auth/register` only ever creates a **TECHNICIAN**. Engineer / Drafter /
   > Admin accounts must be seeded or inserted directly so testers can log in.

5. **Create the uploads directory** (it is git-ignored, so it won't exist on a fresh clone):
   ```bash
   mkdir -p uploads
   ```
   This folder must stay **writable and persistent** across restarts/redeploys —
   uploaded component & sample images live here.

6. **Run the server** under a process manager:
   ```bash
   pm2 start src/server.js --name esheet-api
   pm2 save
   ```

---

## 3. Frontend (`esheet-frontend`)

1. **Configure environment** — copy `.env.example` to `.env.production` and set:
   - `VITE_API_URL` — the public backend API URL, e.g. `https://api.your-domain.com/api`

2. **Build** (fresh install on the server):
   ```bash
   npm install
   npm run build
   ```
   The static site is produced in `dist/`.

3. **Serve `dist/`** as static files (via nginx/Caddy, or any static host).

---

## 4. Reverse proxy & HTTPS

Serve everything over **HTTPS** — the auth token is kept in `localStorage`.

A typical single-domain nginx setup:

- Serve the frontend `dist/` at `/`
- Proxy `/api` and `/uploads` to the backend (`http://localhost:5000`)
- SPA fallback: unknown routes → `index.html`

(Or host the frontend and backend on separate domains — then set `VITE_API_URL`
and `CORS_ORIGINS` accordingly.)

---

## 5. Smoke test after deploy

- `GET /health` on the backend returns `{"status":"ok"}`
- Log in as a **technician** and as an **engineer**
- Technician: create a datasheet → fill klausul → submit
- Engineer: review → approve → download
- Upload a component/sample image and confirm it still loads after a backend restart

---

## 6. Known limitations (acceptable for a controlled user test; harden later)

- No rate limiting on the login endpoint
- No request-body schema validation
- Image-upload type checking is filename-based only
- `uploads/` is local disk — on ephemeral/container hosts, attach a persistent volume
