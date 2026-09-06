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

BACKEND_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"

for sql_file in "$SCRIPT_DIR"/[0-9]*.sql; do
  filename=$(basename "$sql_file")
  echo "  [*] Running $filename ..."

  if [ "$filename" = "002_admin_user.sql" ]; then
    if [ "${NODE_ENV:-development}" = "production" ]; then
      echo "  [!] Skipping $filename — dev admin seed is refused when NODE_ENV=production."
      echo ""
      continue
    fi
    if [ -z "${DEV_ADMIN_EMAIL:-}" ] || [ -z "${DEV_ADMIN_PASSWORD:-}" ]; then
      echo "  [!] Skipping $filename — DEV_ADMIN_EMAIL / DEV_ADMIN_PASSWORD not set."
      echo ""
      continue
    fi

    dev_admin_password_hash="$(
      cd "$BACKEND_DIR" && node -e "require('bcrypt').hash(process.argv[1], 10).then(h => process.stdout.write(h))" "$DEV_ADMIN_PASSWORD"
    )"

    psql "$DATABASE_URL" -f "$sql_file" --quiet --set ON_ERROR_STOP=1 \
      --set "dev_admin_email=$DEV_ADMIN_EMAIL" \
      --set "dev_admin_password_hash=$dev_admin_password_hash"
  else
    psql "$DATABASE_URL" -f "$sql_file" --quiet --set ON_ERROR_STOP=1
  fi

  echo "  [+] $filename done"
  echo ""
done

echo "All seeds completed successfully."
