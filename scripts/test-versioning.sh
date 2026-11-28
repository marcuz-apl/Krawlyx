#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$script_dir/../.githooks/versionlib.sh"

assert_next() {
  actual=$(next_identifier "$1" "$2")
  if [ "$actual" != "$3" ]; then
    printf 'Expected %s from %s, got %s\n' "$3" "$1" "$actual" >&2
    exit 1
  fi
}

assert_next v2.5.0+2611281 261128 v2.5.1+2611282
assert_next v2.5.9+2611289 261128 v2.6.0+261128a
assert_next v2.9.9+261127z 261128 v3.0.0+2611281
assert_next v1.9.1-261127a 261128 v1.9.2+2611281

if (next_identifier v2.5.0+261128z 261128) >/dev/null 2>&1; then
  printf 'Expected an exhausted daily counter to fail\n' >&2
  exit 1
fi
