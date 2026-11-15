#!/usr/bin/env bash
# Exercises gui/resources/update-install.sh against throwaway paths.
#
# Proves the part of the update flow most likely to break: that the installer
# really replaces the app bundle, installs the new daemon binary, installs the
# plist and cleans up the staging directory. Runs without root, without launchd
# and without relaunching anything, so it is safe on a working machine.
#
# The privileged steps (launchctl bootstrap/kickstart, chown) are skipped here;
# they are exercised by a real update from a published release.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
INSTALLER="$REPO/gui/resources/update-install.sh"
ROOT="$(mktemp -d)"
trap 'rm -rf "$ROOT"' EXIT

fail() { echo "✗ $*" >&2; exit 1; }
pass() { echo "✓ $*"; }

[ -f "$INSTALLER" ] || fail "installer not found at $INSTALLER"

# --- fixtures: the app currently installed, and the one downloaded -----------

APP="$ROOT/Applications/BetterTether.app"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
printf 'old-gui' > "$APP/Contents/MacOS/BetterTether"
printf 'old-daemon' > "$APP/Contents/Resources/bettertether"
printf 'old-plist' > "$APP/Contents/Resources/com.s4wbvnny.bettertether.plist"
printf 'only-in-old' > "$APP/Contents/Resources/old-only.txt"

STAGE_PARENT="$ROOT/update-stage"
STAGED="$STAGE_PARENT/BetterTether.app"
mkdir -p "$STAGED/Contents/MacOS" "$STAGED/Contents/Resources"
printf 'new-gui' > "$STAGED/Contents/MacOS/BetterTether"
printf 'new-daemon' > "$STAGED/Contents/Resources/bettertether"
printf 'new-plist' > "$STAGED/Contents/Resources/com.s4wbvnny.bettertether.plist"

mkdir -p "$ROOT/bin"
printf 'old-daemon' > "$ROOT/bin/bettertether"
chmod +x "$ROOT/bin/bettertether"
PLIST_DEST="$ROOT/com.s4wbvnny.bettertether.plist"
printf 'old-plist' > "$PLIST_DEST"

# --- run the installer as the app would --------------------------------------
# PID 999999 does not exist, so the "wait for the GUI to exit" loop returns
# immediately.

BT_SKIP_LAUNCHD=1 BT_SKIP_RELAUNCH=1 \
BT_DAEMON_DEST="$ROOT/bin/bettertether" \
BT_PLIST_DEST="$PLIST_DEST" \
  bash "$INSTALLER" "$APP" "$STAGED" 999999

# --- assertions --------------------------------------------------------------

[ "$(cat "$APP/Contents/MacOS/BetterTether")" = "new-gui" ] || fail "app executable was not replaced"
pass "app bundle replaced by the staged one"

if [ -f "$APP/Contents/Resources/old-only.txt" ]; then
  fail "leftover file from the old bundle survived the swap"
fi
pass "old bundle contents are gone (full replacement, not a merge)"

[ "$(cat "$ROOT/bin/bettertether")" = "new-daemon" ] || fail "daemon binary was not replaced"
[ -x "$ROOT/bin/bettertether" ] || fail "installed daemon is not executable"
pass "daemon binary replaced and executable"

[ "$(cat "$PLIST_DEST")" = "new-plist" ] || fail "launchd plist was not replaced"
pass "launchd plist replaced"

if [ -d "$STAGE_PARENT" ]; then
  fail "staging directory was not cleaned up"
fi
pass "staging directory removed"

# --- negative case: a missing staged bundle must fail loudly -----------------

if BT_SKIP_LAUNCHD=1 BT_SKIP_RELAUNCH=1 \
   BT_DAEMON_DEST="$ROOT/bin/bettertether" BT_PLIST_DEST="$PLIST_DEST" \
   bash "$INSTALLER" "$APP" "$ROOT/missing/BetterTether.app" 999999 >/dev/null 2>&1; then
  fail "installer reported success with a missing staged bundle"
fi
pass "installer rejects a missing staged bundle"

echo
echo "all update-install checks passed"
