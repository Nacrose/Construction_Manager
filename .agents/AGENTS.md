# Workspace Rules

- Always check the build locally (e.g., using `npm run build` or equivalent) before pushing to git from now on.
- Only push to git after user has checked build locally on browser.

## Core Construction Domain Rules

- **BOQ Rate vs. Rate Analysis Rate**:
  - The **BOQ Rate** is the contractual / agreed / billed unit rate for a BoQ item (`Amount = Quantity * BoQ Rate`).
  - **Rate Analysis (RA)** is the internal engineering resource & cost breakdown (Materials, Labor, Equipment, Overheads/Profits) across analysis libraries (Client Estimate, Contractor Bid, Contractor Actual).
  - **The BOQ Rate and Rate Analysis are completely different and independent.** Rate Analysis provides resource planning, budgeting, and cost breakdown for schedules/cashflow—it must NEVER automatically overwrite or be confused with the contractual BOQ Rate.


