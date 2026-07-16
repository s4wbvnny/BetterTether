#!/usr/bin/env bash
# BetterTether — Install CLI daemon + GUI .app to the system.
set -euo pipefail

SELF_DIR="$(cd "$(dirname "$0")" && pwd)"
BINARY_NAME="bettertether"
APP_NAME="BetterTether"
PLIST="com.princePal.bettertether.plist"
PLIST_SRC="$SELF_DIR/launchd/$PLIST"
PLIST_DST="/Library/LaunchDaemons/$PLIST"
BINARY_DST="/usr/local/bin/$BINARY_NAME"
APP_DST="/Applications/$APP_NAME.app"
CONFIG_SRC="$SELF_DIR/config/default.toml"
CONFIG_DIR="/etc/bettertether"
CONFIG_DST="$CONFIG_DIR/bettertether.toml"
LOG_FILE="/var/log/bettertether.log"

# --- Build ---
echo "→ Building daemon..."
make -C "$SELF_DIR" build

echo "→ Building GUI app..."
make -C "$SELF_DIR" app

# --- Install daemon binary ---
echo "→ Installing daemon to $BINARY_DST..."
mkdir -p /usr/local/bin
cp "$SELF_DIR/build/$BINARY_NAME" "$BINARY_DST"
chown root:wheel "$BINARY_DST"
chmod 755 "$BINARY_DST"

# --- Install .app ---
echo "→ Installing GUI to $APP_DST..."
rm -rf "$APP_DST"
ditto "$SELF_DIR/build/$APP_NAME.app" "$APP_DST"
chown -R root:wheel "$APP_DST"

# --- Install launchd plist ---
echo "→ Installing launchd plist..."
cp "$PLIST_SRC" "$PLIST_DST"
chown root:wheel "$PLIST_DST"
chmod 644 "$PLIST_DST"

# --- Install config ---
echo "→ Installing config..."
mkdir -p "$CONFIG_DIR"
if [[ ! -f "$CONFIG_DST" ]]; then
    cp "$CONFIG_SRC" "$CONFIG_DST"
fi
chmod 644 "$CONFIG_DST"

# --- Log file ---
touch "$LOG_FILE"
chmod 666 "$LOG_FILE"

# --- Unload any existing instance ---
/bin/launchctl bootout system "$PLIST_DST" 2>/dev/null || true

# --- Load daemon ---
echo "→ Starting daemon..."
if ! /bin/launchctl bootstrap system "$PLIST_DST" 2>/dev/null; then
    /bin/launchctl load -w "$PLIST_DST" 2>/dev/null || true
fi

echo ""
echo "✓ BetterTether installed!"
echo "  CLI:   $BINARY_DST"
echo "  GUI:   $APP_DST"
echo "  Logs:  $LOG_FILE"
echo ""
echo "To uninstall: sudo bash uninstall.sh"
