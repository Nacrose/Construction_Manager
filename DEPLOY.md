# Deploying Construction Manager to Vercel

This guide walks you through deploying Construction Manager to Vercel
with a Neon Postgres database. Total time: ~5 minutes.

---

## Prerequisites

- A GitHub account with the `Construction-Manager` repo
- A Vercel account (free tier is fine for dev)
- A Neon account (free tier is fine for dev)

## 1. Push the code to GitHub

If you haven't already pushed the project to GitHub:

```bash
git init
git add .
git commit -m "Construction Manager — initial commit"
git branch -M main
git remote add origin https://github.com/Nacrose/Construction-Manager.git
git push -u origin main
```

## 2. Create a Neon Postgres database

1. Go to [neon.tech](https://neon.tech) and sign up
2. Create a new project — name it `construction-manager-db` (or anything)
3. Choose the region closest to your users
4. Copy the **connection string** — it looks like:
   ```
   postgresql://user:password@ep-xxx.region.aws.neon.tech/dbname?sslmode=require
   ```

## 3. Import to Vercel

1. Go to [vercel.com](https://vercel.com) → sign in with GitHub
2. Click **Add New Project**
3. Import your `Construction-Manager` repository
4. Vercel auto-detects Next.js — accept all defaults
5. Under **Environment Variables**, add:
   - `DATABASE_URL` = (your Neon connection string from step 2)
   - `AUTH_SECRET` = (any random 32+ char string — use `openssl rand -hex 32`)
   - `SETUP_SECRET` = (any random string — REQUIRED to call `/api/setup`
     and `/api/seed`; without them first-run bootstrap will refuse to run)
   - Optionally, storage variables — see `.env.example` for the full list
     (`STORAGE_PROVIDER`, R2/S3 keys). Default `local` provider keeps files
     private and streams them via the authenticated `/api/files/[key]` route.
6. Click **Deploy**

> **Note on superadmin bootstrap:** do NOT rely on
> `scripts/setup-superadmin.ts` defaults in production — set
> `SUPERADMIN_EMAIL` / `SUPERADMIN_PASSWORD` env vars (12+ chars) or the
> script will refuse to run against a production `DATABASE_URL`.

## 4. First-run setup

Before the first request can succeed, apply the database schema once
from your machine (or a Vercel shell) against the production
`DATABASE_URL`:

```bash
npx prisma migrate deploy
```

Then, to create the first superadmin, either call the bootstrap
endpoint (with `SETUP_SECRET` set):

```bash
curl -X POST https://<deployment>/api/setup \
  -H "x-setup-secret: $SETUP_SECRET" \
  -H "content-type: application/json" \
  -d '{"email":"admin@example.com","name":"Admin","password":"..."}'
```

…or run `scripts/setup-superadmin.ts` with `SUPERADMIN_EMAIL` /
`SUPERADMIN_PASSWORD` env vars set. Then seed demo data and log in:

1. Click "Seed Demo Data" on the login page to populate sample users,
   a sample project, BOQ items, Gantt tasks, and RFIs
2. Log in with any of the demo accounts shown on the login page

> **Troubleshooting:** if `_prisma_migrations` reports a checksum
> mismatch for `0_init` (a database previously touched by the retired
> runtime DDL), run `npx prisma migrate resolve --applied 0_init`.

You'll then be able to log in with any of the demo accounts shown on
the login page.

## 5. Custom domain (optional)

In Vercel → Project → Settings → Domains, add your custom domain.
Vercel will guide you through DNS configuration.

## 6. Scheduled background jobs (outbox dispatch + invariant probes)

Two background jobs keep production healthy:

| Job | Endpoint | Schedule | Purpose |
|-----|----------|----------|---------|
| Outbox dispatch | `GET /api/cron/outbox` | every 5 minutes | Delivers `OutboxEvent` rows (e.g. `lifecycle.transitioned` notifications); reaps rows stuck in `processing` |
| Invariant probes | `GET /api/cron/invariants` | hourly | GL trial-balance balance check per org + live RLS tenant-isolation probe |

Both endpoints are **fail-closed**: they only run when the caller sends
`Authorization: Bearer <CRON_SECRET>`, and they refuse to start at all if
`CRON_SECRET` is unset.

### Why GitHub Actions instead of vercel.json `crons`?

Vercel's **Hobby plan only allows cron schedules of once per day**. A
`vercel.json` declaring `*/5 * * * *` or `0 * * * *` makes every deployment
fail validation before a build even starts — the commit gets a red
"Deployment failed." status and no build ever appears in the dashboard
(this actually happened and blocked all auto-deploys on 2026-09-02; see
commit that introduced it, and `.github/workflows/cron.yml` header comment).
Since the repo is public, GitHub Actions minutes are free and the scheduler
lives in-repo. If the project moves to Vercel Pro, the schedules can move
back into `vercel.json` `crons` and `.github/workflows/cron.yml` retired.

### Required configuration

1. **Vercel** → Project → Settings → Environment Variables:
   - `CRON_SECRET` = a random 32+ char string (`openssl rand -hex 32`),
     enabled for Production (+ Preview if desired). Without it both
     endpoints return 503 (fail-closed).
2. **GitHub** → repo → Settings → Secrets and variables → Actions:
   - `CRON_SECRET` = the same value as on Vercel
   - `SITE_URL` = the production origin, e.g. `https://your-app.vercel.app`
     (or your custom domain). Until these exist, the Cron workflow fails
     with an explicit "Missing repo secret(s)" message.

### Notes

- GitHub Actions scheduled workflows can be delayed a few minutes under
  peak load; the outbox design (per-row CAS claims + stuck-row reaping)
  makes delayed or overlapping ticks safe — only delivery latency grows.
- Manual one-off run: **Actions → Cron → Run workflow** (runs both jobs).
- Caveat: `SITE_URL`/`CRON_SECRET` are repo-level secrets, so any branch's
  workflow can read them. They only grant access to two endpoints that
  trigger background processing — an acceptable surface for this project;
  move them to GitHub *Environments* scoped to `production` if that ever
  changes.

---

## Local development with Docker Postgres

If you prefer running Postgres locally instead of Neon:

```bash
# Start a Postgres container
docker run --name construction-manager-pg \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=construction_manager \
  -p 5432:5432 -d postgres

# Set the DATABASE_URL in .env
echo 'DATABASE_URL=postgresql://postgres:password@localhost:5432/construction_manager' > .env
echo 'AUTH_SECRET=dev-secret-change-later' >> .env

# Install deps and run
npm install
npm run dev
```

---

## Troubleshooting

### Build fails with Prisma errors
Run `npx prisma generate` locally and commit the updated `node_modules/.prisma`
cache. (This shouldn't be necessary — `postinstall` runs `prisma generate`
automatically — but if Vercel's cache is stale this fixes it.)

### "Database connection refused"
Check that `DATABASE_URL` is set in Vercel environment variables AND that
the variable is exposed to the deployment (Vercel dashboard → Project →
Settings → Environment Variables → make sure the checkboxes for
"Production", "Preview", and "Development" are all ticked).

### Auto-redirect loop on login page
This was a known issue caused by the auto-login backdoor in `AppGuard`.
It has been removed in the `stabilize` branch. If you're still seeing
it, make sure you're on the latest commit.
