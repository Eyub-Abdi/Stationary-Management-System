# Deployment Guide

How to bring up KJ Stationery on a shop / server machine and keep it updated.
The app runs as a single Node process serving both the API and the web UI on
one port (default **3000**), backed by PostgreSQL.

---

## 1. Install prerequisites (you do this once, manually)

- **Node.js** LTS (18+), which includes `npm`
- **PostgreSQL** (15+), running, with a database created for the app
- **Git**
- **Build tools** for native modules (`argon2`):
  - Windows: "Desktop development with C++" (Visual Studio Build Tools), or it
    usually installs from a prebuilt binary — only needed if the prebuilt fails.
  - Linux: `build-essential` + `python3`.

Create the database, e.g.:

```sql
CREATE DATABASE kj_stationary;
```

---

## 2. Configure `.env`

Copy the project, then create a `.env` in the project root. Required values:

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | ✅ | `postgresql://USER:PASSWORD@localhost:5432/kj_stationary?schema=public` |
| `JWT_ACCESS_SECRET` | ✅ | **≥ 32 characters** (random) |
| `JWT_REFRESH_SECRET` | ✅ | **≥ 32 characters**, different from the access secret |
| `SEED_ADMIN_EMAIL` | ✅ (setup) | First admin login |
| `SEED_ADMIN_PASSWORD` | ✅ (setup) | First admin password — change it after first login if you like |
| `PORT` | optional | Defaults to `3000` |
| `CORS_ORIGINS` | optional | Defaults to `*`; not needed when the API serves the UI on the same origin |
| `PG_BIN_DIR` | optional | Folder containing `pg_dump`/`pg_restore` if they aren't on `PATH` |

Generate strong secrets:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

The boot process **refuses to start** if a required secret is missing or too
short — that's intentional.

---

## 3. First-time setup

```bash
npm run setup
```

This installs backend + frontend dependencies, generates the Prisma client,
applies all database migrations (`prisma migrate deploy`), seeds the admin user
from `.env`, and builds the backend and frontend.

> The setup installs **dev dependencies** on purpose (the Prisma CLI, the Nest
> build, and the seeder all need them). Do **not** set `NODE_ENV=production`
> before running it, or the build/seed will fail.

---

## 4. Run it

```bash
npm run serve
```

Open **http://localhost:3000** and sign in with the admin credentials.

---

## 5. Start automatically when the computer turns on

Two options, easiest first:

**A. Settings → System → "Run on startup" (no admin rights).**
Enable the toggle. It drops a launcher in the Windows Startup folder that runs
`npm run serve` and opens the browser on sign-in. Good for a single shop till.
Requires a build to exist (step 3). This is *start-on-login*, not a service —
it does not auto-restart on a crash.

**B. Windows Service (most robust — survives crashes, starts before login).**
Use [NSSM](https://nssm.cc/) once, from an **elevated** terminal:

```bat
nssm install KJStationery "C:\Program Files\nodejs\node.exe" "C:\path\to\project\dist\src\main.js"
nssm set KJStationery AppDirectory "C:\path\to\project"
nssm set KJStationery Start SERVICE_AUTO_START
nssm start KJStationery
```

PostgreSQL already runs as a Windows service, so the database comes up on boot
on its own. Put a desktop shortcut to `http://localhost:3000` for the operator.

---

## 6. Updating after code changes

One command pulls the latest code and applies only what changed:

```bash
npm run pull
```

`pull` fetches **directly from the repo URL + branch** (no `origin` remote
needed on the server), then **installs dependencies only if the package files
changed**, **runs `prisma generate` + migrations only if `prisma/` changed**, and
rebuilds when there are new commits (it stops early with "Already up to date" if
there's nothing new). Stop the running app/service first — on Windows the
Prisma engine is locked while the app runs — then restart it afterward to pick
up the new build.

> It uses `git pull --ff-only`, so it only ever fast-forwards — the server
> never creates a commit or a merge. Keep the server checkout clean (no local
> edits) or the fast-forward will refuse. The repo URL/branch are baked in;
> override with `REPO_URL` / `REPO_BRANCH` env vars if they change.

There's also `npm run update` (same steps, unconditional, **no** git pull) if you
ever update the code some other way.

---

## 7. Backups

- **Settings → System → Backup**: downloads a full `.dump` of the database.
  Keep these off the machine (USB / cloud) — the downloaded file *is* the backup.
  Do one at the end of each business day.
- **Restore**: upload a `.dump` (typed confirmation required). It atomically
  replaces all current data, then the app reloads.
- CLI equivalents also exist: `npm run db:backup` / `npm run db:restore`.

---

## 8. Reliability notes

- A **UPS** on the shop PC is the single biggest reliability win — PostgreSQL is
  crash-safe but a hard power-cut mid-write is the main real-world risk, and
  daily backups cover the worst case.
- Use **one** mode at a time: the dev servers (`npm run start:dev` / `npm run dev`)
  and the production server (`npm run serve`) both want port 3000.
- If `pg_dump`/`pg_restore` aren't found by the backup feature, set `PG_BIN_DIR`
  in `.env` to the PostgreSQL `bin` folder.
