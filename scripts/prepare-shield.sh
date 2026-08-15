#!/bin/sh
set -eu

repository_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

npm --prefix "$repository_root/atlas-shield" run update-lists
node "$repository_root/browser-profile/extensions/atlas-shield/build-rules.js"
node "$repository_root/browser-profile/scripts/validate-profile.js"
npm --prefix "$repository_root/atlas-shield" test
