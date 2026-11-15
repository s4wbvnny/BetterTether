#!/bin/bash
# update-install.sh — applies a staged BetterTether update.
#
# Invoked by the app as: sudo update-install.sh <currentApp> <stagedApp> <guiPID>
#
# Everything is passed as an argument, never interpolated into a shell string,
# so a release tag or a user name containing a quote cannot become shell code.
#
# The BT_* overrides exist so scripts/test-update-install.sh can exercise this
# without root and without touching the real daemon. Production leaves them unset.

set -u

APP="$1"
STAGED="$2"
PID="$3"

LABEL="${BT_LAUNCHD_LABEL:-com.s4wbvnny.bettertether}"
DAEMON_DEST="${BT_DAEMON_DEST:-/usr/local/bin/bettertether}"
PLIST_DEST="${BT_PLIST_DEST:-/Library/LaunchDaemons/com.s4wbvnny.bettertether.plist}"
SKIP_LAUNCHD="${BT_SKIP_LAUNCHD:-}"
SKIP_RELAUNCH="${BT_SKIP_RELAUNCH:-}"

log() { echo "[update] $*"; }

[ -n "$APP" ] || { log "missing app path"; exit 1; }
[ -n "$STAGED" ] || { log "missing staged path"; exit 1; }
[ -d "$STAGED" ] || { log "staged app not found: $STAGED"; exit 1; }

# Stop the daemon so its binary can be replaced.
if [ -z "$SKIP_LAUNCHD" ]; then
  /bin/launchctl bootout "system/$LABEL" 2>/dev/null || true
  sleep 1
fi

# Wait for the GUI to exit; it is holding the app bundle open.
while kill -0 "$PID" 2>/dev/null; do sleep 0.5; done

log "replacing $APP"
rm -rf "$APP" || { log "could not remove $APP"; exit 1; }
/usr/bin/ditto "$STAGED" "$APP" || { log "could not copy staged app"; exit 1; }
rm -rf "$(dirname "$STAGED")"

NEW_BIN="$APP/Contents/Resources/bettertether"
NEW_PLIST="$APP/Contents/Resources/com.s4wbvnny.bettertether.plist"

if [ -f "$NEW_BIN" ]; then
  log "installing daemon binary"
  cp -f "$NEW_BIN" "$DAEMON_DEST" || { log "could not install daemon"; exit 1; }
  chmod +x "$DAEMON_DEST"
  xattr -dr com.apple.quarantine "$DAEMON_DEST" 2>/dev/null || true
else
  log "warning: no daemon binary in the staged app"
fi

if [ -f "$NEW_PLIST" ]; then
  log "installing launchd plist"
  cp -f "$NEW_PLIST" "$PLIST_DEST" || { log "could not install plist"; exit 1; }
  chmod 644 "$PLIST_DEST"
  if [ -z "$SKIP_LAUNCHD" ]; then
    chown root:wheel "$PLIST_DEST"
    xattr -dr com.apple.quarantine "$PLIST_DEST" 2>/dev/null || true
    /bin/launchctl bootstrap system "$PLIST_DEST" 2>/dev/null || true
    /bin/launchctl kickstart -k "system/$LABEL"
  fi
fi

if [ -n "$SKIP_LAUNCHD" ]; then
  log "skipping launchd (BT_SKIP_LAUNCHD set)"
fi

if [ -z "$SKIP_RELAUNCH" ]; then
  log "relaunching"
  open "$APP"
fi

log "done"
