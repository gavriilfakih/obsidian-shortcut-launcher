#!/bin/zsh
# Build and copy into a vault: ./deploy.sh [vault-path]
#
# The dev vault (~/Developer/obsidian-vault-dev) symlinks this repo directly
# and needs no deploy; hot-reload picks up main.js as soon as it is written.
#
# The main vault deliberately holds a real directory rather than a symlink, for
# two reasons: its data.json is the live launcher config and must not be shared
# with the dev vault, and Obsidian Sync can only carry a real plugin folder to
# iOS.

set -euo pipefail

vault="${1:-${OBSIDIAN_VAULT:-$HOME/Vault}}"
target="$vault/.obsidian/plugins/obsidian-shortcut-launcher"

if [[ ! -d "$vault/.obsidian" ]]; then
	echo "not a vault: $vault" >&2
	exit 1
fi

pnpm run build

mkdir -p "$target"
cp main.js manifest.json "$target/"
echo "deployed $(node -p "require('./manifest.json').version") to $target"
echo "reload with: obsidian plugin:reload id=obsidian-shortcut-launcher"
