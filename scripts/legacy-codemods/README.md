# Legacy Code-Mod Scripts

These one-off scripts were used during the initial Next.js 16 migration to
patch source files programmatically (regex-based `fs.readFileSync` + replace).
They are **not part of the build** and **should not be run again** — they're
kept here for historical reference only.

## Contents

| Script | What it did |
|---|---|
| `update-gantt.js` | Patched `src/server/routers/gantt.ts` to add new endpoints |
| `update-gantt-ui.js` | Patched the Gantt page UI |
| `update-gantt-modal.js` | Patched the Gantt modal component |
| `upgrade-pages.js` | Injected `AnimatedPage` imports into 12 page files |
| `add-table-id.js` | Patched `<DataTable>` JSX with `tableId` attributes |
| `check.ts` | DB sanity-check script (has a known copy-paste bug — logs `taskCount` instead of `libCount`) |

## Safe to delete?

Yes, after confirming no one references them. They were committed for
traceability. A future cleanup commit can `git rm` this entire directory.
