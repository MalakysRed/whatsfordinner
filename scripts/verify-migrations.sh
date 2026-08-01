#!/usr/bin/env bash
#
# Applies every migration to a throwaway Postgres cluster and runs the RLS
# assertions against it.
#
# This exists because Supabase's local stack needs Docker, which is not always
# available, and "the migration file looks right" is not the same as "the
# migration applies and the policies isolate households". Nothing here touches a
# real project — the cluster is created in a temp directory and destroyed on
# exit.
#
# Requires the Postgres server binaries (initdb, pg_ctl). On Debian/Ubuntu those
# are in postgresql-16, not postgresql-client-16.

set -euo pipefail

# initdb refuses to run as root. Drop to an unprivileged user and re-exec.
if [ "$(id -u)" -eq 0 ]; then
  RUN_AS="${PGRUNAS:-postgres}"
  if ! id "$RUN_AS" >/dev/null 2>&1; then
    echo "error: running as root and no '$RUN_AS' user to drop to" >&2
    echo "set PGRUNAS to an unprivileged username" >&2
    exit 1
  fi
  exec setpriv --reuid="$RUN_AS" --regid="$RUN_AS" --init-groups "$0" "$@"
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"

if [ ! -x "$PGBIN/initdb" ]; then
  echo "error: no Postgres server binaries at $PGBIN" >&2
  echo "set PGBIN, or install the postgresql server package" >&2
  exit 1
fi

WORKDIR="$(mktemp -d)"
PGDATA="$WORKDIR/data"
SOCKET="$WORKDIR/socket"
LOG="$WORKDIR/postgres.log"
mkdir -p "$SOCKET"

cleanup() {
  "$PGBIN/pg_ctl" -D "$PGDATA" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$WORKDIR"
}
trap cleanup EXIT

echo "==> initialising throwaway cluster"
"$PGBIN/initdb" -D "$PGDATA" -U postgres --auth=trust >/dev/null

echo "==> starting postgres"
"$PGBIN/pg_ctl" -D "$PGDATA" -l "$LOG" \
  -o "-k $SOCKET -c listen_addresses=''" \
  -w start >/dev/null

export PGHOST="$SOCKET"
export PGUSER=postgres
export PGDATABASE=postgres

psql -v ON_ERROR_STOP=1 -q -c "create database whatsfordinner;" >/dev/null
export PGDATABASE=whatsfordinner

echo "==> applying Supabase stand-ins (auth schema, roles)"
psql -v ON_ERROR_STOP=1 -q -f "$REPO_ROOT/scripts/sql/auth_stub.sql"

echo "==> applying migrations"
for migration in "$REPO_ROOT"/supabase/migrations/*.sql; do
  echo "    $(basename "$migration")"
  psql -v ON_ERROR_STOP=1 -q -f "$migration"
done

echo "==> running RLS and auth assertions"
echo "    (ERROR lines below are expected: several checks assert that a write"
echo "     is refused, and print the refusal they were looking for)"
psql -v ON_ERROR_STOP=1 -q -f "$REPO_ROOT/scripts/sql/rls_check.sql"

echo
echo "migrations apply cleanly and the security assertions pass"
