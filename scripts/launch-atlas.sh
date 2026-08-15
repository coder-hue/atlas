#!/bin/sh
set -eu

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 /absolute/path/to/chromium/src" >&2
  exit 2
fi

repository_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
chromium_src=$1
extension_id=hehggadaopoacecdllhhajmbjkdcmajg
atlas_binary="$chromium_src/out/Atlas/Atlas Browser.app/Contents/MacOS/Atlas Browser"
shield_extension="$repository_root/browser-profile/extensions/atlas-shield"

chatgpt_extension=$(find \
  "$HOME/Library/Application Support/Google/Chrome/Default/Extensions/$extension_id" \
  -mindepth 1 -maxdepth 1 -type d -print 2>/dev/null | sort | tail -1)

if [ ! -x "$atlas_binary" ]; then
  echo "Atlas Browser has not been built at $atlas_binary" >&2
  exit 1
fi

if [ -z "$chatgpt_extension" ]; then
  echo "OpenAI's ChatGPT extension is not installed in the default Chrome profile." >&2
  exit 1
fi

if [ ! -f "$shield_extension/rules.json" ]; then
  echo "Run ./scripts/prepare-shield.sh before launching Atlas." >&2
  exit 1
fi

exec "$atlas_binary" \
  --user-data-dir="$repository_root/.atlas-profile" \
  --no-first-run \
  --no-default-browser-check \
  --disable-sync \
  --load-extension="$chatgpt_extension,$shield_extension"
