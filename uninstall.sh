#!/usr/bin/env bash
# BetterTether — Completely remove CLI daemon, GUI .app, and all system artifacts.
set -euo pipefail

BINARY_DST="/usr/local/bin/bettertether"
APP_DST="/Applications/BetterTether.app"
PLIST_DST="/Library/LaunchDaemons/com.princePal.bettertether.plist"
CONFIG_DIR="/etc/bettertether"
LOG_FILE="/var/log/bettertether.log"

echo "→ Stopping daemon (system domain)..."
/bin/launchctl bootout system/com.princePal.bettertether 2>/dev/null || true
/bin/launchctl bootout system "$PLIST_DST" 2>/dev/null || true

echo "→ Killing any running bettertether process..."
pkill -9 bettertether 2>/dev/null || true

echo "→ Removing daemon binary..."
rm -f "$BINARY_DST"

echo "→ Removing GUI app..."
rm -rf "$APP_DST"

echo "→ Removing launchd plist..."
rm -f "$PLIST_DST"

echo "→ Removing config..."
rm -rf "$CONFIG_DIR"

echo "→ Removing log..."
rm -f "$LOG_FILE"

echo ""
echo "✓ BetterTether fully uninstalled."
