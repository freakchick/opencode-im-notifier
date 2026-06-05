#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR"

source_plugin="opencode-im-notifier"

bump="${1:-patch}"
registry="${2:-https://registry.npmjs.org}"

if [ "$bump" != "none" ]; then
  echo ">>> Bumping version ($bump)..."
  npm version "$bump" --no-git-tag-version
fi

echo ">>> Cleaning dist..."
rm -rf dist

echo ">>> Building..."
npm run build

echo ">>> Publishing to $registry..."
npm publish --registry "$registry"

new_version="$(node -p "require('./package.json').version")"

echo ""
echo ">>> Published $source_plugin@$new_version"
