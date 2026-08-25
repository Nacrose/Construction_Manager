# Workspace Rules

- **CRITICAL DIRECTIVE FOR ALL AI AGENTS**: ALWAYS consult the user and present findings/proposed changes for explicit confirmation BEFORE modifying or creating files. Never edit files unannounced.
- Always check the build locally (e.g., using `npm run build` or equivalent) before pushing to git.
- Only push to git after user has checked build locally on browser.

## UI Design & Aesthetic Rules (Strict User Directive)

- **No Nested Cards & Title Header Boxes**:
  - Never wrap form sections inside small boxed cards with separate header title text/borders within borders.
  - Forms must be clean, spacious, frameless/borderless layouts with natural flow, crisp subtle field labels, and zero visual clutter.
- **Background Blur on Modals**:
  - Whenever a modal or form is open, the background must ALWAYS have a strong dark glass backdrop blur (`backdrop-blur-md bg-black/75`).
- **Zero Scroll Preference**:
  - Wide screen layouts where all inputs and actions are visible on screen without vertical scrollbars.

## Core Construction Domain Rules

- **Target Audience & Scope**:
  - This platform is built **EXCLUSIVELY for Construction Contractors, Joint Ventures (JVs), and Builders**.
  - **This is NOT a Client / Consultant / Owner portal.** All features, ledgers, and workflows must serve the contractor's operations, site deliveries, subcontractor payments, and joint venture distribution.
- **BOQ Rate vs. Rate Analysis Rate**:
  - The **BOQ Rate** is the contractual / agreed / billed unit rate for a BoQ item (`Amount = Quantity * BoQ Rate`).
  - **Rate Analysis (RA)** is the internal engineering resource & cost breakdown (Materials, Labor, Equipment, Overheads/Profits) across analysis libraries (Client Estimate, Contractor Bid, Contractor Actual).
  - **The BOQ Rate and Rate Analysis are completely different and independent.** Rate Analysis provides resource planning, budgeting, and cost breakdown for schedules/cashflow—it must NEVER automatically overwrite or be confused with the contractual BOQ Rate.
