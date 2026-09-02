# Construction Manager

> **🤖 Mandatory Directive for All AI Agents**:
> **ALWAYS consult and get explicit user approval before editing, adding, or removing files.**
> Run discovery, audit, and planning first. Present your findings and the exact proposed changes to the user for confirmation BEFORE modifying any code or files in the repository.

> **⚠️ Core System Scope & Positioning**:
> **This platform is built EXCLUSIVELY for Construction Contractors, Joint Ventures (JVs), and Builders.**
> **This is NOT a Client / Consultant / Owner portal.**
> **This is an OFFICE-USE web application** — built for desktop browsers in a head-office / site-office setting, used by staff on a stable internet connection. It is **online-first by design**: the browser app targets online use and is NOT a mobile app and has no app-store build. A service worker ships for push notifications and app-shell caching, and an IndexedDB offline mutation queue exists as groundwork for future field workflows — authenticated data (tRPC responses, `/api/*` bytes) is never persisted to disk by the service worker. Offline field workflows are a roadmap item, not a committed feature.
> Every workflow is engineered around contractor reality: site material deliveries, subcontractor labor bills, Bahi Khata Day Books, VAT & TDS compliance, BOQ rate analysis, plant & equipment fleet logs, and Joint Venture royalty/equity sharing.

A comprehensive construction enterprise management platform tailored for contractor and JV operations in Nepal (DoR / DUDBC / NEA standards) — encompassing BOQ & rate analysis, Day Book & cash-basis accounting, centralized finance & payables, Gantt scheduling, RFI workflows, site daily reports, IPC progress claims, variations, equipment fleet, staff HR, and multi-site inventory.

Built with Next.js 16 (App Router), React 19, TypeScript, tRPC v11, Prisma 6, PostgreSQL, and Tailwind CSS.

---

## Table of Contents

- [Quick Start](#quick-start)
- [Environment Variables](#environment-variables)
- [Project Structure](#project-structure)
- [Tech Stack](#tech-stack)
- [Domain Modules](#domain-modules)
- [Data Model](#data-model)
- [Authentication & Authorization](#authentication--authorization)
- [API Layer](#api-layer)
- [Deployment](#deployment)
- [Available Scripts](#available-scripts)
- [Roadmap](#roadmap)

---

## Quick Start

### Prerequisites

- **Node.js 20+** (Node 24 recommended)
- **PostgreSQL 14+** (local install, Docker, or Neon free tier)
- **npm 10+** (the project uses npm; `bun.lock` is legacy and will be removed)

### Install & Run

```bash
# 1. Clone
git clone https://github.com/Nacrose/Construction-manager-0.2.git
cd Construction-Manager

# 2. Install dependencies
npm install

# 3. Copy env vars and fill in real values
cp .env.example .env
#   - DATABASE_URL=postgresql://user:pass@host:5432/db
#   - AUTH_SECRET=<any random 32+ char string>

# 4. Generate Prisma client (runs automatically on postinstall)
npx prisma generate

# 5. Apply the schema, then run the dev server
#    (migrations are the single source of truth — the app never
#    patches the schema at runtime)
npx prisma migrate deploy
npm run dev

# 6. Open http://localhost:3000
```

### Demo Login

Once seeded, the app creates 4 demo users. Use the quick-login buttons on
the `/login` page, or sign in manually:

| Role              | Email              | Password      |
|-------------------|--------------------|---------------|
| Project Manager   | manager@pm.com     | manager123    |
| Site Engineer     | engineer@pm.com    | engineer123   |
| Quantity Surveyor | surveyor@pm.com    | surveyor123   |
| Subcontractor     | subcon@pm.com      | subcon123     |

---

## Environment Variables

| Variable        | Required | Description                                                |
|-----------------|----------|------------------------------------------------------------|
| `DATABASE_URL`  | yes      | PostgreSQL connection string (e.g. Neon, Supabase, Docker) |
| `AUTH_SECRET`   | yes      | Random 32+ char string used to sign JWTs                   |

Copy `.env.example` to `.env` and fill in real values. Never commit `.env`.

---

## Project Structure

```
construction-manager/
├── src/
│   ├── app/                      # Next.js App Router
│   │   ├── (app)/                # Protected route group (auth required)
│   │   │   ├── dashboard/
│   │   │   ├── projects/
│   │   │   │   └── [id]/         # Per-project workspace
│   │   │   │       ├── boq/      # Bill of Quantities
│   │   │   │       ├── gantt/    # Gantt chart & scheduling
│   │   │   │       ├── workflow/ # RFI, daily reports, daily program
│   │   │   │       ├── materials/
│   │   │   │       ├── equipment/
│   │   │   │       ├── hr/       # Staff & attendance
│   │   │   │       ├── documents/
│   │   │   │       ├── drawings/
│   │   │   │       ├── ipc/      # Interim Payment Certificates
│   │   │   │       ├── variations/
│   │   │   │       ├── subcontractors/
│   │   │   │       └── page.tsx  # Project overview
│   │   │   ├── projects/page.tsx # Project list
│   │   │   ├── activity/         # Audit log
│   │   │   └── presets/          # Rate analysis library
│   │   ├── api/                  # REST route handlers
│   │   │   ├── auth/             # login, logout, me
│   │   │   ├── dashboard/        # Aggregate dashboard stats
│   │   │   ├── setup/            # First-run schema bootstrap
│   │   │   ├── seed/             # Demo data seeding
│   │   │   └── trpc/[trpc]/      # tRPC endpoint
│   │   ├── login/
│   │   ├── layout.tsx            # Root layout (providers)
│   │   ├── page.tsx              # Root redirect
│   │   └── globals.css
│   ├── components/
│   │   ├── ui/                   # 50+ shadcn/ui primitives
│   │   ├── workflow/             # RFI dialogs, kanban, file dropzone
│   │   ├── app-sidebar.tsx
│   │   ├── app-guard.tsx         # Client-side route protection
│   │   ├── top-nav.tsx
│   │   └── providers.tsx         # React Query, theme, toaster
│   ├── lib/
│   │   ├── auth.ts               # bcrypt + JWT (jose) + sessions
│   │   ├── authz.ts              # RBAC helpers (assertProjectMember, etc)
│   │   ├── audit.ts              # Audit-log writer
│   │   ├── db.ts                 # Prisma singleton
│   │   ├── api.ts                # JSON response helpers
│   │   ├── client-auth.ts        # Client-side token storage + fetchWithAuth
│   │   ├── trpc-client.ts        # tRPC React client
│   │   ├── ui-store.ts           # Zustand sidebar state
│   │   └── utils.ts              # cn() and other utilities
│   ├── server/
│   │   ├── trpc/                 # tRPC setup (context, procedures)
│   │   └── routers/              # 53 domain routers (see below)
│   ├── hooks/                    # use-mobile, use-toast
│   └── proxy.ts                  # Next.js 16 edge middleware (JWT auth gate)
├── prisma/
│   ├── schema.prisma             # 137 models, 4 enums, 4,121 lines
│   ├── seed.ts                   # Demo data + DoR/DUDBC rate presets
│   └── migrations/               # Prisma migration chain (CI-verified on scratch DBs)
├── scripts/                      # Ad-hoc dev scripts + legacy code-mods
│   └── legacy-codemods/          # One-off migration scripts (do not run)
├── public/                       # logo.svg, robots.txt
├── .zscripts/                    # Container build/start scripts (Docker)
├── prisma/                       # Schema, seed, migrations
├── next.config.ts
├── eslint.config.mjs
├── tsconfig.json
├── components.json               # shadcn/ui config
├── vercel.json                   # Vercel deployment
└── Caddyfile                     # Reverse proxy config (alt deploy)
```

---

## Tech Stack

| Layer            | Technology                                                |
|------------------|-----------------------------------------------------------|
| Framework        | Next.js 16 (App Router) + React 19                        |
| Language         | TypeScript 5 (strict)                                     |
| API              | tRPC v11 + superjson, plus REST route handlers            |
| ORM              | Prisma 6 on PostgreSQL                                    |
| Auth             | bcryptjs (cost 12) + JWT via `jose` + DB-backed sessions  |
| UI               | Tailwind CSS 4 + shadcn/ui (new-york) + Radix primitives  |
| State/Data       | TanStack Query v5 + TanStack Table v8 + Zustand           |
| Forms            | react-hook-form + zod + @hookform/resolvers               |
| Charts           | recharts                                                  |
| Drag & drop      | @dnd-kit/core + @dnd-kit/sortable                         |
| Other            | framer-motion, @mdxeditor/editor, xlsx, lucide-react      |
| Deployment       | Vercel + Neon Postgres (default), or self-hosted (Caddy)  |

---

## Domain Modules

| Module | Path | Description |
|---|---|---|
| Dashboard | `/dashboard` | Cross-project KPIs, recent activity, alerts |
| Projects | `/projects` | Project list, create, archive |
| Project Workspace | `/projects/[id]` | Per-project overview with module switcher |
| BOQ & Rate Analysis | `/projects/[id]/boq` | Bill of Quantities with versioned rate analysis |
| Gantt | `/projects/[id]/gantt` | Task scheduling, dependencies, BOQ↔task links, resource loading, undo/redo |
| RFI Workflow | `/projects/[id]/workflow/rfi` | Request-for-Information lifecycle (draft → submitted → approved/rejected) with attachments & comments |
| Daily Reports | `/projects/[id]/workflow/reports` | Site daily reports with photos, weather, manpower, equipment |
| Daily Program | `/projects/[id]/workflow/program` | Plan vs Actual with carry-over of incomplete tasks |
| Materials | `/projects/[id]/materials` | Material master, transactions, suppliers, purchase orders |
| Equipment | `/projects/[id]/equipment` | Equipment master, logs, maintenance schedule |
| HR / Staff | `/projects/[id]/hr` | Staff roster, attendance, daily allocation |
| Documents | `/projects/[id]/documents` | Document register with revision tracking, transmittals |
| Drawings | `/projects/[id]/drawings` | Drawing register with revision tracking |
| IPC | `/projects/[id]/ipc` | Interim Payment Certificates — running bills, approvals |
| Variations | `/projects/[id]/variations` | Variation Orders with approval workflow |
| Subcontractors | `/projects/[id]/subcontractors` | Subcontractor registry, work scope, payments |
| Activity Log | `/activity` | Audit trail of all mutations across projects |
| Presets | `/presets` | DoR/DUDBC standard rate-analysis library (reusable across projects) |

> **Important Domain Concept — BOQ Rate vs. Rate Analysis Rate**:
> - **BOQ Rate**: The contractual unit rate agreed in the contract/tender. It dictates billing and IPC payments (`Amount = Quantity * BoQ Rate`).
> - **Rate Analysis (RA)**: The underlying engineering resource breakdown (Materials, Labor, Equipment, Overheads/Profits) across libraries (*Client Estimate*, *Contractor Bid*, *Contractor Actual*). Used for costing, resource planning in Gantt schedules, and cash flow.
> - **They are completely independent entities.** Rate Analysis does *not* overwrite or dictate the contract BOQ Rate.

---

## Data Model

The Prisma schema (`prisma/schema.prisma`, 4,121 lines) defines 137 models
organized by domain:

- **Identity & Access**: `User`, `Session`, `Project`, `ProjectMember`
  (with role: `ADMIN` / `MANAGER` / `ENGINEER` / `SURVEYOR` / `SUBCONTRACTOR` / `VIEWER`)
- **RFI**: `Rfi`, `RfiItem`, `RfiAttachment`, `RfiComment`, `RfiResponse`
- **Daily Reporting**: `DailyReport`, `DailyProgram`, `StaffAttendance`
- **BOQ & Rate Analysis**: `BoqItem`, `BoqIngredient`, `RateAnalysis`,
  `AnalysisLibrary`, `BoqVersion`
- **Scheduling**: `GanttVersion`, `GanttTask`, `TaskDependency`, `TaskBoqLink`
- **Materials**: `Material`, `MaterialTransaction`, `Supplier`, `PurchaseOrder`
- **Equipment**: `Equipment`, `EquipmentLog`, `EquipmentMaintenance`
- **Documents**: `Document`, `DocumentRevision`, `Transmittal`
- **Drawings**: `Drawing`, `DrawingRevision`
- **Payments**: `Ipc`, `VariationOrder`
- **HR**: `Staff`, `GateEntry`
- **Subcontractors**: `Subcontractor`
- **Audit**: `AuditLog`

Three enums: `LibraryPurpose`, `BoqVersionStatus`, `VersionStatus`.

---

## Authentication & Authorization

### Authentication Flow

1. User submits email + password to `POST /api/auth/login`
2. Server verifies password with bcrypt (cost 12)
3. Server issues a JWT signed with `AUTH_SECRET` (HS256, 7-day expiry),
   with a `jti` claim stored in the `Session` table for revocation
4. Client stores the JWT in `localStorage` and sends it as
   `Authorization: Bearer <token>` on subsequent requests
5. `POST /api/auth/logout` invalidates the session row (token can no
   longer be used even before its expiry)
6. `GET /api/auth/me` validates the token + session on each page load

### Authorization (RBAC)

Server-side authorization is enforced via helpers in `src/lib/authz.ts`:

- `assertProjectMember(prisma, userId, projectId)` — must be a member
- `assertCanWrite(...)` — must have a write-capable role
- `assertProjectAdmin(...)` — must be `ADMIN`
- `assertProjectManager(...)` — must be `ADMIN` or `MANAGER`

Roles per project: `ADMIN`, `MANAGER`, `ENGINEER`, `SURVEYOR`,
`SUBCONTRACTOR`, `VIEWER`.

### Audit Logging

All mutations through tRPC routers write to the `AuditLog` table via
`src/lib/audit.ts`. Audit writes are best-effort and never throw.

---

## API Layer

### tRPC (primary API surface)

- Endpoint: `POST /api/trpc/[trpc]`
- 53 routers merged in `src/server/routers/_app.ts` (accounting, finance,
  payroll, vat-register, ipc, boq, gantt-*, rfi, submittal, material-*,
  equipment-*, hr, jv-partner, admin, chat, workflow, and more — see
  `src/server/routers/`)
- Superjson transformer enables Date, Map, Set, BigInt, undefined
  serialization end-to-end
- Type-safe end-to-end: client types are inferred from the server router

### REST Route Handlers

Used for non-tRPC concerns:
- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- `GET /api/dashboard` (cross-project dashboard aggregates)
- `POST /api/setup` (first-superadmin bootstrap; schema comes from migrations)
- `POST /api/seed` (demo data seeding)

---

## Deployment

### Option A: Vercel + Neon (recommended for dev)

1. Push the repo to GitHub
2. Go to [vercel.com](https://vercel.com) → import the repo
3. Add environment variables:
   - `DATABASE_URL` → Neon connection string
   - `AUTH_SECRET` → random 32+ char string
4. Deploy — Vercel detects Next.js automatically
5. Apply the schema once: `npx prisma migrate deploy` against the
   production `DATABASE_URL` (see DEPLOY.md for the full first-run flow)

### Option B: Self-hosted (Docker + Caddy)

Build & start scripts are in `.zscripts/`:

```bash
.zscripts/build.sh   # Build the Next.js app
.zscripts/start.sh   # Start the production server
```

The included `Caddyfile` proxies `:81 → localhost:3000`. Useful for
Nepal-based VPS deployments where data sovereignty matters.

### Database Migrations

Prisma migrations are the **single source of truth** for the schema
(`prisma/migrations/` — 15 migrations incl. the RLS phases and the
2026-08-30 drift repair). Apply them with `npx prisma migrate deploy`.
The runtime DDL system (`ensure-schema.ts`) was retired in v1.2: it
raced the migration chain, silently swallowed its own failures,
corrupted the `0_init` checksum, and still left fresh databases broken
for payroll/VAT/catalog/outbox modules. If a legacy database reports a
`0_init` checksum mismatch, resolve it with
`npx prisma migrate resolve --applied 0_init`.

---

## Available Scripts

```bash
npm run dev          # Start dev server (http://localhost:3000)
npm run build        # prisma generate && next build
npm run start        # Start production server (after build)
npm run lint         # Run ESLint

# Prisma
npm run db:generate  # prisma generate (regenerate client after schema changes)
npm run db:push      # prisma db push (dev only — sync schema without migration)
npm run db:migrate   # prisma migrate dev (create + apply a migration)
npm run db:reset     # prisma migrate reset (drop + recreate — DEV ONLY)

# Type-check (no npm script yet — run directly)
npx tsc --noEmit
```

---

## Roadmap

### Stabilization (complete on `main` branch)

- [x] Remove auto-login backdoor in `AppGuard`
- [x] Re-enable TypeScript + ESLint build checks
- [x] Clean repo of binary/internal files
- [x] Add this README
- [x] Retire `/api/setup` raw SQL (`ensure-schema.ts`) — `prisma migrate deploy` is the only schema path (v1.2)
- [x] Drop `z-ai-web-dev-sdk` from runtime deps
- [x] Pick one package manager (npm) and delete `bun.lock`
- [x] Add Vitest — 107 test files / ~1,348 cases incl. live-Postgres RLS integration + Playwright E2E
- [x] Split the 2,751-line `boq/page.tsx` into components (now ~450 lines)

### Feature Candidates (post-stabilization)

- [x] Multi-tenancy / organization support (orgs, RLS, platform admin + impersonation)
- [x] Role-based dashboard variants
- [x] Real-time RFI collaboration (WebSocket)
- [x] Excel import for BOQ
- [x] Email/notification system
- [ ] Audit log UI
- [x] Variation Order approval workflow
- [x] IPC auto-calculation from BOQ progress

> **Out of scope (product decision):** mobile-app builds. This is an office-use,
> online-first web application for desktop browsers — field data still flows
> through office staff today. The shipped service worker (push + app shell) and
> IndexedDB offline mutation queue are groundwork for potential offline field
> workflows, not a committed offline mode.
