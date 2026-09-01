# Workspace Rules

- **CRITICAL DIRECTIVE FOR ALL AI AGENTS**: ALWAYS consult the user and present findings/proposed changes for explicit confirmation BEFORE modifying or creating files. Never edit files unannounced.

## ENGINE PROTOCOL (Long-Term Architecture Law — adopted Phase A)

The codebase is being consolidated onto a central engine kit. The kit is exactly these artifacts — nothing else is an engine without user approval:

| Engine | Location | Owns |
|---|---|---|
| Lifecycle Graph | `src/server/utils/lifecycle-graph.ts` | ALL status transitions: edges, roles, fiscal-lock/JE/delegation flags, `canTransition()` |
| State Machine | `src/server/utils/state-machine.ts` | Executing transitions (audit attribution, domain events, graph-derived from-states) |
| ConstructionTable | `src/components/ui/construction-table.tsx` | ALL tabular data rendering, search, summaries, Excel export |
| StatusBadge | `src/components/ui/status-badge.tsx` | ALL lifecycle status chips |
| formatNpr | `src/lib/currency.ts` | ALL NPR/number rendering |
| FormDialogEngine | `src/components/engine/form-dialog-engine.tsx` | ALL dialogs that create/edit/submit via tRPC: Aero framing, form state, zod validation, submit, toast, invalidation, close/reset (adopted Phase B, extracted from the leaves pilot) |
| Engine form fields | `src/components/engine/form-fields.tsx` | ALL fields inside engine dialogs (text/number/currency/date/Nepali-date/select/textarea/switch) — extend the kit, never restyle ad hoc |
| useRegister | `src/hooks/use-register.ts` | Register/list page query plumbing: typed query + pick, loading/fetching, refresh (adopted Phase B, extracted from the leaves pilot) |

Phase B notes:
- The speculative `src/components/ui/form-engine.tsx` (ConstructionForm, zero adopters) was DELETED; its field kit lives on in `src/components/engine/form-fields.tsx` behind FormDialogEngine.
- Page-in-page embedding: a page embedded in a host that already renders the tab bar (e.g. PaymentsPage / TaxSummaryPage inside `/finance`) takes an `embedded` prop and skips its own `<ModuleTabs />`. Never stack two tab bars.

**Protocol rules every change must obey:**

1. **Single path** — a concern owned by an engine exists ONLY in that engine. Parallel implementations are build errors (enforced by ESLint ratchet: `eslint-ratchet.mjs`).
2. **Fail loud** — engines validate and throw; they never silently degrade (see `createJournalEntry` unbalanced check as the standard).
3. **Typed end-to-end** — zod → tRPC → React inference at engine boundaries; no `any` escapes.
4. **Escape hatch without fork** — extend an engine via its config/slots/props when it doesn't fit; NEVER copy it into a page.
5. **Extractive, not speculative** — new engines are pulled out of a real migrated screen, never designed in the abstract. No engine "exists" until it has replaced at least one real page.
6. **The ratchet only tightens** — `eslint-ratchet.mjs` allowlists may only shrink in a PR, never grow. A PR that adds a violation is rejected; extend the engine instead.
7. **Graph is normative** — `LIFECYCLE_GRAPHS` defines what transitions SHOULD exist. Known current-behavior drift is tracked in `KNOWN_DRIFT` (lifecycle-graph.test.ts) and must be closed when the domain migrates. Adding a feature = adding an edge; UI renders it automatically via the `lifecycle` tRPC router.
8. **Definition of done** (extends the sweep directive below): implemented + sweep-verified (grep/ESLint counts move only downward) + tests pass + `npm run build` green.

- **MANDATORY ENGINE REUSE & EVOLUTION DIRECTIVE (ZERO AD-HOC DUPLICATION RULE)**:
  - **MANDATORY: ALWAYS USE THE EXISTING CENTRAL ENGINE OR EVOLVE/REMAKE THE ENGINE. NEVER RE-IMPLEMENT AD-HOC DUPLICATES.**
  - **Tables & Data Grids**: ALWAYS use `<ConstructionTable />` (`@/components/ui/construction-table`) for all tabular data, search, column filters, pagination, summary calculation footers, and Excel exports. **NEVER** write manual HTML `<table>` elements with custom ad-hoc state.
  - **Currency & Number Formatting**: ALWAYS import and use `formatNpr()` from `@/lib/currency`. **NEVER** write local `fmt()`, `npr()`, or ad-hoc `.toLocaleString()` formatting functions.
  - **Badges & Status Chips**: ALWAYS use `<StatusBadge />` (`@/components/ui/status-badge`) or standard workflow badges.
  - **Modals & Dialog Overlays**: ALWAYS ensure all modals utilize dark glass backdrop blur (`backdrop-blur-md bg-black/85 border-white/10 text-white`).
  - **Domain Calculators & Utilities**: ALWAYS import from centralized domain libraries and barrel exports:
    - `@/lib/construction-finance` for `currency.ts`, `pan-vat.ts`, `construction-tax.ts`, `procurement-match.ts`.
    - `@/lib/field-engineering` for `measurement-calc.ts`, `equipment-telemetry.ts`.
    - Central server utils in `@/server/utils/` (`date-miti.ts`, `stock-ledger.ts`, `sequence-generator.ts`, `domain-events.ts`, `state-machine.ts`, etc.).
  - **Rule for Missing Engine Capabilities**: If a feature requires a capability that an existing engine does not yet support, **YOU MUST EXTEND OR REFACTOR THE CENTRAL ENGINE ITSELF** so that all modules benefit, rather than creating a one-off ad-hoc implementation.
- **MANDATORY REUSE & MINIMALISM DIRECTIVE (STRICT USER RULE)**:
  - **ALWAYS check and confirm if existing models, components, dialogs, routers, and tabs can be reused or extended before adding new ones.**
  - **NEVER create duplicate buttons, duplicate models, or new sub-tabs when an existing workflow (e.g. Day Book, Record Payment dialog, Project dropdown) can handle it naturally.**
  - Keep the system unified, streamlined, and minimalist. Zero redundant entities or UI sprawl.
- **MANDATORY APP-WIDE SWEEP DIRECTIVE (NO HALF-WIRED FEATURES)**:
  - **A feature, fix, or security change is NOT done until it is verified as consistently applied across every relevant call site in the entire codebase.**
  - After implementing anything — a security primitive, a UI component, a utility, a domain rule — you MUST grep/search the codebase for all existing call sites that should use it and confirm they do. Do not assume previous code is already compliant.
  - **Security primitives** (e.g. `withOrgContext`, `financialProcedure`, `assertNotLocked`, `assertDelegation`): Every `$transaction`, every financial mutation, every org-scoped write must be checked.
  - **UI engines** (e.g. `<ConstructionTable />`, `<StatusBadge />`, `formatNpr()`): After every engine update, grep for ad-hoc duplicates and replace them.
  - **The definition of "done"**: A task is complete only when (a) the change is implemented, (b) a codebase-wide search confirms no existing site is left behind, and (c) the build passes. "I added it to the new code" is not done.
  - This rule exists because the most common failure mode in this codebase is building something correctly and then not wiring it in everywhere. Do not repeat that mistake.
- **CENTRAL ENGINE IS A PERMANENT, NON-NEGOTIABLE ARCHITECTURAL LAW**:
  - The central engines (`ConstructionTable`, `StatusBadge`, `formatNpr`, `withOrgContext`, `financialProcedure`, `assertGlBalanced`, etc.) are permanent fixtures of this codebase. They do not get bypassed, replaced inline, or worked around — ever.
  - If the engine does not support a new use case, the engine is extended. The one-off implementation is never the answer.
  - Any code review, AI-assisted change, or refactor that introduces an ad-hoc duplicate of a central engine component must be rejected and re-done through the engine.
- Always check the build locally (e.g., using `npm run build` or equivalent) before pushing to git.
- Only push to git after user has checked build locally on browser.

## UI Design & Aesthetic Rules (Strict User Directive)

- **Purpose-Driven UX Directive (No "Rule of Cool" & Zero Duplicate Elements)**:
  - **Every single pixel, button, badge, and element on the UI MUST serve an explicit, operational purpose.**
  - **NEVER** add visual elements, decorative widgets, or nested cards purely for the "rule of cool" or aesthetics. If an element does not deliver functional utility or actionable data to the contractor, remove it.
  - **Zero Duplicate Elements**: Never repeat labels, headers, breadcrumbs, or status chips when another UI component already conveys that state.
- **Zero Redundant Section / Tab Headers (No Duplicate Title Rows)**:
  - When a tab, nav item, or module is already highlighted/active in the top navigation bar, **NEVER** render a duplicate header title, sub-tab bar, or section label repeating the tab's name (e.g. Do NOT show "📖 Day Book (दैनिक रोजकट्टी)" underneath the active "Day Book & Cashbook" tab).
  - The content component must render immediately under the main navigation bar with zero redundant title clutter.
- **No Nested Cards & Title Header Boxes**:
  - Never wrap form sections inside small boxed cards with separate header title text/borders within borders.
  - Forms must be clean, spacious, frameless/borderless layouts with natural flow, crisp subtle field labels, and zero visual clutter.
- **Background Blur on Modals**:
  - Whenever a modal or form is open, the background must ALWAYS have a strong dark glass backdrop blur (`backdrop-blur-md bg-black/85`).
- **Zero Scroll & 16:10 Aspect Ratio Preference (Strict Directive)**:
  - All dialogs, forms, and modals MUST strictly follow a landscape **16:10 aspect ratio (width > height, aspect-[16/10] / widescreen proportional)** unless explicitly stated otherwise by the user.
  - Wide screen layouts where all inputs and actions fit comfortably on screen with zero vertical scrollbars.

## Core Construction Domain Rules

- **Target Audience & Scope**:
  - This platform is built **EXCLUSIVELY for Construction Contractors, Joint Ventures (JVs), and Builders**.
  - **This is NOT a Client / Consultant / Owner portal.** All features, ledgers, and workflows must serve the contractor's operations, site deliveries, subcontractor payments, and joint venture distribution.
- **BOQ Rate vs. Rate Analysis Rate**:
  - The **BOQ Rate** is the contractual / agreed / billed unit rate for a BoQ item (`Amount = Quantity * BoQ Rate`).
  - **Rate Analysis (RA)** is the internal engineering resource & cost breakdown (Materials, Labor, Equipment, Overheads/Profits) across analysis libraries (Client Estimate, Contractor Bid, Contractor Actual).
  - **The BOQ Rate and Rate Analysis are completely different and independent.** Rate Analysis provides resource planning, budgeting, and cost breakdown for schedules/cashflow—it must NEVER automatically overwrite or be confused with the contractual BOQ Rate.
