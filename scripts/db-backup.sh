#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Database backup — pg_dump wrapper with timestamp naming + checksums.
#
# Usage:
#   DATABASE_URL="postgresql://..." ./scripts/db-backup.sh [output_dir]
#
# Output: <output_dir>/construction-manager-<UTC timestamp>.sql.gz
#         + a matching .sha256 file.
#
# Local verification of a backup (ALSO run the full restore drill — see
# docs/BACKUP_RESTORE_RUNBOOK.md; a backup you have never restored is not
# a backup):
#   gunzip -t <file>.sql.gz                       # archive integrity
#   sha256sum -c <file>.sha256                    # checksum
#   zcat <file>.sql.gz | head -20                 # readable SQL
#
# Retention: keeps the newest KEEP (default 14) backups in the output dir.
# Schedule via cron (example: 02:30 every night):
#   30 2 * * * cd /srv/construction-manager && DATABASE_URL=... ./scripts/db-backup.sh >> /var/log/cm-backup.log 2>&1
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

command -v pg_dump >/dev/null 2>&1 || { echo "ERROR: pg_dump not found (install postgresql-client)." >&2; exit 1; }

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL is not set." >&2
  exit 1
fi

OUT_DIR="${1:-./backups}"
KEEP="${KEEP:-14}"
mkdir -p "$OUT_DIR"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="$OUT_DIR/construction-manager-$STAMP.sql.gz"

# --no-owner/--no-privileges: the restore drill re-creates roles separately,
# which keeps the dump portable across environments (e.g. Neon -> local).
echo "[db-backup] dumping to $FILE ..."
pg_dump "$DATABASE_URL" --no-owner --no-privileges --clean --if-exists | gzip -9 > "$FILE"

sha256sum "$FILE" > "$FILE.sha256"
echo "[db-backup] wrote $(du -h "$FILE" | cut -f1) + checksum."

# Sanity check: the dump must contain our schema, not just be empty.
if ! zcat "$FILE" | grep -q 'CREATE TABLE' 2>/dev/null; then
  echo "[db-backup] WARNING: dump contains no CREATE TABLE statements — investigate before trusting it." >&2
fi

# Retention: newest KEEP survive.
ls -1t "$OUT_DIR"/construction-manager-*.sql.gz 2>/dev/null | tail -n +"$((KEEP + 1))" |
  while read -r old; do
    rm -f "$old" "$old.sha256"
    echo "[db-backup] pruned $(basename "$old")"
  done

echo "[db-backup] done. Backups on disk: $(ls -1 "$OUT_DIR"/construction-manager-*.sql.gz | wc -l)"
