#!/usr/bin/env python3
"""Boot an embedded PostgreSQL 16 with TCP enabled (pgserver's bundled
binaries) and run the vitest DB-gated suites against it:
smoke-flow.test.ts, rls-integration.test.ts, rls-coverage.test.ts.

pgserver's default socket-only URI is rejected by Prisma ("empty host"),
so this script drives initdb + pg_ctl directly with:
  - listen_addresses=127.0.0.1, port 55432
  - trust auth (scratch test cluster, localhost only)

Usage:
  /home/z/.venv/bin/python scripts/run-db-tests.py [vitest target files...]

Exits non-zero if any suite fails. Scratch data lives in /tmp/cm-smoke-pg
(wiped on each start — the migration chain must build a clean database).
"""
import os
import shutil
import subprocess
import sys
import time

PGDATA = "/tmp/cm-smoke-pg"
PORT = int(os.environ.get("SMOKE_PG_PORT", "55432"))
# Binary source: pgserver's bundled PG16 (old sandbox) or @embedded-postgres
# (npm, PG18) — point SMOKE_PG_BIN at the directory containing initdb/pg_ctl.
BIN = os.environ.get(
    "SMOKE_PG_BIN",
    "/home/z/.venv/lib/python3.12/site-packages/pgserver/pginstall/bin",
)
PG_CTL = f"{BIN}/pg_ctl"
INITDB = f"{BIN}/initdb"
URL = f"postgresql://postgres@127.0.0.1:{PORT}/postgres"


def run(cmd, **kw):
    print(f"[run-db-tests] $ {' '.join(cmd)}", flush=True)
    return subprocess.run(cmd, **kw)


def start_pg() -> None:
    if os.path.exists(PGDATA):
        subprocess.run([PG_CTL, "-D", PGDATA, "stop", "-m", "immediate", "-t", "5"],
                       capture_output=True)
        shutil.rmtree(PGDATA, ignore_errors=True)

    r = run([INITDB, "-D", PGDATA, "-U", "postgres", "--auth=trust", "-E", "UTF8"],
            capture_output=True, text=True)
    if r.returncode != 0:
        print(r.stdout + r.stderr)
        sys.exit(1)

    # unix_directories keeps the socket path short AND we enable TCP for Prisma.
    r = run([PG_CTL, "-D", PGDATA,
             "-o", f'-p {PORT} -h 127.0.0.1 -k {PGDATA} -c fsync=off -c synchronous_commit=off',
             "-l", f"{PGDATA}/server.log", "start"], capture_output=True, text=True)
    if r.returncode != 0:
        print(r.stdout + r.stderr)
        print(open(f"{PGDATA}/server.log").read() if os.path.exists(f"{PGDATA}/server.log") else "")
        sys.exit(1)

    # Wait for readiness — pg_isready when available, else a raw TCP probe.
    isready = f"{BIN}/pg_isready"
    for _ in range(50):
        if os.path.exists(isready):
            p = subprocess.run(
                [isready, "-h", "127.0.0.1", "-p", str(PORT)],
                capture_output=True, text=True)
            ok = p.returncode == 0
        else:
            import socket
            try:
                with socket.create_connection(("127.0.0.1", PORT), timeout=1):
                    ok = True
            except OSError:
                ok = False
        if ok:
            print(f"[run-db-tests] PG ready at {URL}", flush=True)
            return
        time.sleep(0.2)
    print("PG did not become ready")
    sys.exit(1)


def main() -> None:
    start_pg()
    env = dict(os.environ)
    env["TEST_DATABASE_URL"] = URL
    env["DATABASE_URL"] = URL  # prisma migrate deploy inside tests uses this

    target = sys.argv[1:] or [
        "src/server/routers/__tests__/smoke-flow.test.ts",
        "src/server/routers/__tests__/rls-integration.test.ts",
        "src/server/routers/__tests__/rls-coverage.test.ts",
    ]
    cmd = ["npx", "vitest", "run"] + target
    proc = subprocess.run(cmd, env=env, cwd="/home/z/my-project/Construction_Manager")
    subprocess.run([PG_CTL, "-D", PGDATA, "stop", "-m", "immediate", "-t", "5"],
                   capture_output=True)
    sys.exit(proc.returncode)


if __name__ == "__main__":
    main()
