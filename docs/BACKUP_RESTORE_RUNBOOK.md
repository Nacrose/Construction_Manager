# Backup & Restore Runbook

Construction Manager holds multi-tenant financial records (journals, payroll,
payments). Data loss in this class ends companies. This runbook defines the
backup strategy, the restore procedure, and — most importantly — the restore
DRILL, because a backup that has never been restored is only a hope.

## Strategy overview

| Layer | What | Cadence | Owner |
|---|---|---|---|
| Provider PITR | Neon point-in-time restore / WAL archive | continuous | Platform |
| Logical dumps | `scripts/db-backup.sh` (pg_dump, gz + sha256) | nightly 02:30 UTC (cron) | Ops |
| Restore drill | Restore to a scratch database + verify | **monthly, and after every major migration** | Ops |
| Pre-migration snapshot | `pg_dump` before each `prisma migrate deploy` | every deploy | Deployer |

Do not rely on a single layer: PITR restores the provider region (and its
failure modes); logical dumps are portable and provider-independent.

## 1. Nightly logical backup

```bash
DATABASE_URL="postgresql://... pooled-or-direct ..." ./scripts/db-backup.sh /backups/cm
```

- Output: `construction-manager-<UTC timestamp>.sql.gz` + `.sha256`
- Retention: newest 14 in the directory (`KEEP=30 ./scripts/db-backup.sh` to override)
- Copy the backup directory off-host (object storage) — a backup that lives
  on the same machine as the database is not a backup.
- Cron example is in the script header.

## 2. Pre-deploy snapshot (before every `prisma migrate deploy`)

```bash
./scripts/db-backup.sh /backups/cm-predeploy
```

Migrations are forward-only; the snapshot is the only way back if a migration
corrupts data (e.g. a backfill guard fires on legacy rows).

## 3. Restore drill (monthly + after major migrations)

A drill answers three questions: does the dump restore, does the app run
against it, and is the data complete? Run all three:

### 3.1 Restore to a scratch database

```bash
createdb cm_restore_drill
zcat /backups/cm/construction-manager-<stamp>.sql.gz | psql "$RESTORE_URL" 2> restore-errors.log
# EXPECT: restore-errors.log contains only benign NOTICEs.
# Any ERROR line = failed drill — file an incident, do not wait.
```

### 3.2 Migrate + boot

```bash
DATABASE_URL="$RESTORE_URL" npx prisma migrate deploy   # expect: no pending migrations
DATABASE_URL="$RESTORE_URL" npm run build && npm start  # app boots, login works
```

`migrate deploy` reporting pending migrations means the dump predates the
current chain — fine for PITR-era data, a red flag for last night's dump.

### 3.3 Verify data completeness

```sql
-- Row counts vs. expectations (record your baseline after each drill):
SELECT 'projects'  AS t, count(*) FROM "Project"
UNION ALL SELECT 'journal_entries', count(*) FROM "JournalEntry"
UNION ALL SELECT 'journal_lines',  count(*) FROM "JournalEntryLine"
UNION ALL SELECT 'payments',       count(*) FROM "Payment"
UNION ALL SELECT 'payroll_runs',   count(*) FROM "PayrollRun"
UNION ALL SELECT 'audit_log',      count(*) FROM "AuditLog";

-- Financial integrity: debits must equal credits in every balanced journal.
SELECT count(*) AS unbalanced_entries
FROM (
  SELECT je.id
  FROM "JournalEntry" je
  JOIN "JournalEntryLine" jl ON jl."entryId" = je.id
  GROUP BY je.id
  HAVING abs(sum(CASE WHEN jl."side" = 'debit' THEN jl.amount ELSE -jl.amount END)) > 0.01
) x;

-- Tenant isolation survived the restore: the RLS gate still passes.
```

Then run the RLS gate against the restored database (it re-applies nothing,
just verifies):

```bash
TEST_DATABASE_URL="$RESTORE_URL" npx vitest run \
  src/server/routers/__tests__/rls-integration.test.ts
```

### 3.4 Log the drill

Append to `docs/rls-evidence/restore-drills.md`: date, backup stamp, row
counts, drill verdict. Two consecutive failed monthly drills = escalate.

## 4. Real restore (incident)

1. **Announce** — maintenance page up, team notified.
2. **Snapshot the broken state** first (`db-backup.sh /backups/incident`) —
   post-mortems need it.
3. Pick the recovery point:
   - Bad data from a deploy → the pre-deploy snapshot.
   - Corruption/catastrophe → Neon PITR to the last known-good timestamp,
     or last night's logical dump.
4. Restore into a FRESH database, verify with §3.3 queries, then switch
   `DATABASE_URL` and restart.
5. **Never** restore in place over live data.
