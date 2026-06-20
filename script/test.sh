#!/usr/bin/env bash
# Run the project's automated tests with Node's built-in test runner via tsx.
# Usage: bash script/test.sh
set -euo pipefail
cd "$(dirname "$0")/.."
exec node_modules/.bin/tsx --test "server/__tests__/"*.test.ts
