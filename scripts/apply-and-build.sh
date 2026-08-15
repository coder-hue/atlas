#!/bin/sh
set -eu

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 /absolute/path/to/chromium/src" >&2
  exit 2
fi

repository_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
chromium_src=$1
patch_file="$repository_root/patches/atlas-chromium.patch"
expected_revision=$(tr -d '\n' < "$repository_root/chromium/REVISION")

actual_revision=$(git -C "$chromium_src" rev-parse HEAD)
if [ "$actual_revision" != "$expected_revision" ]; then
  echo "Atlas expects Chromium $expected_revision; found $actual_revision" >&2
  exit 1
fi

git -C "$chromium_src" apply --check "$patch_file"
git -C "$chromium_src" apply "$patch_file"
mkdir -p "$chromium_src/out/Atlas"
cp "$repository_root/chromium/args.gn" "$chromium_src/out/Atlas/args.gn"

PATH="$chromium_src/../../depot_tools:/opt/homebrew/bin:$PATH"
export PATH

"$chromium_src/buildtools/mac/gn" gen "$chromium_src/out/Atlas"
autoninja -C "$chromium_src/out/Atlas" chrome
