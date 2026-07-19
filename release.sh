#!/bin/zsh
# Cut a release: ./release.sh 1.3.0
#
# BRAT installs this fork by reading the repository's GitHub releases, so the
# manifest.json and main.js attached here are what every tracking vault gets.

set -euo pipefail

if [[ $# -ne 1 ]]; then
	echo "usage: $0 <version>" >&2
	exit 1
fi

version="$1"

if ! command -v gh &> /dev/null; then
	echo "gh is required: brew install gh" >&2
	exit 1
fi

# Upstream shells out to the `json` npm global here. Node is already a
# dependency, so use it rather than installing a tool globally.
#
# versions.json maps plugin version -> minimum Obsidian version. Upstream
# hardcodes 0.13.0; this fork needs whatever manifest.json actually requires.
node -e '
	const fs = require("fs");
	const version = process.argv[1];
	const write = (file, edit) => {
		const json = JSON.parse(fs.readFileSync(file, "utf8"));
		edit(json);
		fs.writeFileSync(file, JSON.stringify(json, null, 2) + "\n");
	};
	const minApp = JSON.parse(fs.readFileSync("manifest.json", "utf8")).minAppVersion;
	write("package.json",  (j) => { j.version = version; });
	write("manifest.json", (j) => { j.version = version; });
	write("versions.json", (j) => { j[version] = minApp; });
	console.log(`${version} requires Obsidian ${minApp}`);
' "$version"

pnpm test
pnpm run build

git commit -a -m "Release $version"
git push

git tag "$version"
git push origin --tags

gh release create "$version" ./manifest.json ./main.js
