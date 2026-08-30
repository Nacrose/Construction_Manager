#!/usr/bin/env python3
"""E2E orchestrator: Postgres → migrations → seed → build → next start →
Playwright → teardown, as ONE reproducible path for local runs and the CI
`e2e` job.

Database modes:
  - E2E_DATABASE_URL set (CI: postgres:16 service container) → used directly
  - otherwise boot an embedded PostgreSQL 16 (pgserver's bundled binaries,
    same as scripts/run-db-tests.py) on port 55433 with a scratch data dir

Server:
  - `npm run build` (production bundle — the same artifact Vercel ships)
  - `next start` on port 3100 with AUTH_SECRET/DATABASE_URL injected

Usage:
  /home/z/.venv/bin/python scripts/e2e-run.py            # full pipeline
  /home/z/.venv/bin/python scripts/e2e-run.py --no-build # reuse .next/

Exit code: Playwright's exit code (teardown always runs).
"""
import os
import shutil
import signal
import subprocess
import sys
import time
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PGDATA = "/tmp/cm-e2e-pg"
PORT = int(os.environ.get("E2E_PG_PORT", "55433"))
BIN = "/home/z/.venv/lib/python3.12/site-packages/pgserver/pginstall/bin"
PG_CTL = f"{BIN}/pg_ctl"
INITDB = f"{BIN}/initdb"
EMBEDDED_URL = f"postgresql://postgres@127.0.0.1:{PORT}/postgres"

APP_PORT = int(os.environ.get("E2E_APP_PORT", "3100"))
BASE_URL = f"http://127.0.0.1:{APP_PORT}"
AUTH_SECRET = os.environ.get("E2E_AUTH_SECRET", "e2e-test-secret-0123456789abcdef0123456789abcdef")

embedded_pg = not os.environ.get("E2E_DATABASE_URL")
DB_URL = os.environ.get("E2E_DATABASE_URL") or EMBEDDED_URL
server_proc = None


def run(cmd, **kw):
    print(f"[e2e] $ {' '.join(cmd)}", flush=True)
    return subprocess.run(cmd, cwd=ROOT, **kw)


def start_embedded_pg():
    if os.path.exists(PGDATA):
        subprocess.run([PG_CTL, "-D", PGDATA, "stop", "-m", "immediate", "-t", "5"],
                       capture_output=True)
        shutil.rmtree(PGDATA, ignore_errors=True)
    r = subprocess.run([INITDB, "-D", PGDATA, "-U", "postgres", "--auth=trust", "-E", "UTF8"],
                       capture_output=True, text=True)
    if r.returncode != 0:
        print(r.stdout + r.stderr)
        sys.exit(1)
    r = subprocess.run(
        [PG_CTL, "-D", PGDATA,
         "-o", f"-p {PORT} -h 127.0.0.1 -k {PGDATA} -c fsync=off -c synchronous_commit=off",
         "-l", f"{PGDATA}/server.log", "start"],
        capture_output=True, text=True)
    if r.returncode != 0:
        print(r.stdout + r.stderr)
        print(open(f"{PGDATA}/server.log").read() if os.path.exists(f"{PGDATA}/server.log") else "")
        sys.exit(1)
    for _ in range(50):
        p = subprocess.run([f"{BIN}/pg_isready", "-h", "127.0.0.1", "-p", str(PORT)],
                           capture_output=True, text=True)
        if p.returncode == 0:
            print(f"[e2e] embedded PG ready at {EMBEDDED_URL}", flush=True)
            return
        time.sleep(0.2)
    print("[e2e] embedded PG did not become ready")
    sys.exit(1)


def wait_for_server(timeout_s: int = 120) -> None:
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(f"{BASE_URL}/login", timeout=5) as resp:
                if resp.status < 500:
                    print(f"[e2e] app ready at {BASE_URL}", flush=True)
                    return
        except Exception:
            pass
        time.sleep(1.0)
    print(f"[e2e] app did not become ready at {BASE_URL}")
    sys.exit(1)


def teardown():
    global server_proc
    if server_proc is not None:
        try:
            os.killpg(os.getpgid(server_proc.pid), signal.SIGTERM)
            server_proc.wait(timeout=15)
        except Exception:
            try:
                os.killpg(os.getpgid(server_proc.pid), signal.SIGKILL)
            except Exception:
                pass
        server_proc = None
    if embedded_pg:
        subprocess.run([PG_CTL, "-D", PGDATA, "stop", "-m", "immediate", "-t", "5"],
                       capture_output=True)


def main() -> None:
    do_build = "--no-build" not in sys.argv

    if embedded_pg:
        start_embedded_pg()

    env = dict(os.environ, DATABASE_URL=DB_URL)

    # `npm run db:generate` = prisma generate + the Decimal→number type patch
    # (plain `prisma generate` would clobber the patched client types and
    # break any later tsc / Next build type-check on this machine).
    if run(["npm", "run", "db:generate"], env=env).returncode != 0:
        sys.exit(1)
    if run(["npx", "prisma", "migrate", "deploy"], env=env).returncode != 0:
        print("[e2e] prisma migrate deploy failed — fresh-DB migration chain is broken")
        sys.exit(1)
    if run(["node", "scripts/e2e-seed.mjs"], env=env).returncode != 0:
        sys.exit(1)

    if do_build:
        build_env = dict(
            env,
            AUTH_SECRET=AUTH_SECRET,
            NEXT_TELEMETRY_DISABLED="1",
            NODE_OPTIONS=os.environ.get("NODE_OPTIONS", "--max-old-space-size=6144"),
        )
        if run(["npm", "run", "build"], env=build_env).returncode != 0:
            print("[e2e] production build failed")
            sys.exit(1)

    global server_proc
    server_env = dict(
        env,
        AUTH_SECRET=AUTH_SECRET,
        NEXT_TELEMETRY_DISABLED="1",
    )
    server_proc = subprocess.Popen(
        ["npx", "next", "start", "-p", str(APP_PORT)],
        cwd=ROOT,
        env=server_env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.STDOUT,
        start_new_session=True,  # own process group → clean teardown
    )
    wait_for_server()

    pw_env = dict(
        os.environ,
        E2E_BASE_URL=BASE_URL,
    )
    code = subprocess.run(["npx", "playwright", "test"], cwd=ROOT, env=pw_env).returncode

    teardown()
    sys.exit(code)


if __name__ == "__main__":
    try:
        main()
    finally:
        teardown()
