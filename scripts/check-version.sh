#!/usr/bin/env bash
# Fails when the version in gui/package.json does not match the newest entry in
# VERSIONS.md (and, when a tag is supplied, the tag being released).
#
# This matters because electron-builder names the DMG from package.json while
# .github/workflows/release.yml downloads it by tag: a mismatch publishes a
# release whose DMG cannot be found, and every installed app keeps reporting the
# old version, so the update prompt never clears.
#
# Usage: scripts/check-version.sh [vX.Y.Z]
set -euo pipefail

cd "$(dirname "$0")/.."

versions_entry=$(grep -m1 '^## v' VERSIONS.md | awk '{print $2}' || true)
pkg_version=$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' gui/package.json | head -1)

die() { echo "✗ $*" >&2; exit 1; }

[ -n "$versions_entry" ] || die "could not read a version from VERSIONS.md"
[ -n "$pkg_version" ] || die "could not read version from gui/package.json"

expected=${versions_entry#v}

if [ -n "${1:-}" ]; then
  tag=${1#v}
  [ "$expected" = "$tag" ] || die "VERSIONS.md says $versions_entry but the tag is v$tag"
fi

if [ "$pkg_version" != "$expected" ]; then
  echo "✗ version mismatch:" >&2
  echo "    VERSIONS.md      : $versions_entry" >&2
  echo "    gui/package.json : $pkg_version" >&2
  echo "  They must match before tagging: electron-builder names the DMG from" >&2
  echo "  package.json and the release workflow looks it up by tag." >&2
  exit 1
fi

echo "✓ versions agree: $versions_entry (gui/package.json $pkg_version)"
