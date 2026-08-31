#!/usr/bin/env bash
# Database Seed Runner
# Usage: pnpm db:seed
#
# Runs all SQL seed files in order against DATABASE_URL.
# Requires: psql (PostgreSQL client)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Load .env if present
if [ -f "$SCRIPT_DIR/../../../.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$SCRIPT_DIR/../../../.env"
  set +a
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL is not set. Create a .env file or export it."
  exit 1
fi

echo "Running database seeds..."
echo ""

for sql_file in "$SCRIPT_DIR"/[0-9]*.sql; do
  filename=$(basename "$sql_file")
  echo "  [*] Running $filename ..."
  psql "$DATABASE_URL" -f "$sql_file" --quiet --set ON_ERROR_STOP=1
  echo "  [+] $filename done"
  echo ""
done

echo "All seeds completed successfully."
