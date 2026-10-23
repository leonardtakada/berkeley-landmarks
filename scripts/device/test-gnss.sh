#!/usr/bin/env bash
# Exercise the production GNSS parser and freshness rules without ESP-IDF or hardware.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
TEST_DIR=$(mktemp -d "${TMPDIR:-/tmp}/berkeley-gnss-test.XXXXXX")
trap 'rm -rf "$TEST_DIR"' EXIT
"${CC:-cc}" -std=c11 -Wall -Wextra -Werror -Wno-unused-parameter \
  -I"$ROOT/device/tests/stubs" "$ROOT/device/tests/gnss_test.c" -lm \
  -o "$TEST_DIR/gnss_test"
"$TEST_DIR/gnss_test"
