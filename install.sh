#!/usr/bin/env bash
# BetterTether — Install daemon + GUI .app to the system.
set -euo pipefail

SELF_DIR="$(cd "$(dirname "$0")" && pwd)"
BINARY_NAME="bettertether"
UNINSTALL_NAME="bettertether-uninstall"
APP_NAME="BetterTether"
PLIST="com.s4wbvnny.bettertether.plist"
PLIST_SRC="$SELF_DIR/launchd/$PLIST"
PLIST_DST="/Library/LaunchDaemons/$PLIST"
BINARY_DST="/usr/local/bin/$BINARY_NAME"
UNINSTALL_DST="/usr/local/bin/$UNINSTALL_NAME"
APP_DST="/Applications/$APP_NAME.app"
CONFIG_SRC="$SELF_DIR/config/default.toml"
CONFIG_DIR="/etc/bettertether"
CONFIG_DST="$CONFIG_DIR/bettertether.toml"
LOG_FILE="/var/log/bettertether.log"

# Check prerequisites
if ! command -v node &>/dev/null; then
  echo "Error: Node.js is required. Install with: brew install node"
  exit 1
fi

# --- Enable Touch ID for sudo (like iTerm2) ---
PAM_TID_FILE="/etc/pam.d/sudo_local"
PAM_TID_LINE="auth       sufficient     pam_tid.so"
if [[ "$OSTYPE" == darwin* ]]; then
  if [[ -f "$PAM_TID_FILE" ]]; then
    if grep -q '^#.*auth.*sufficient.*pam_tid\.so' "$PAM_TID_FILE" 2>/dev/null; then
      echo "→ Enabling Touch ID for sudo..."
      sed -i '' 's/^#.*auth.*sufficient.*pam_tid\.so.*/'"$PAM_TID_LINE"'/' "$PAM_TID_FILE"
      echo "  ✓ Touch ID enabled for sudo"
    elif grep -q 'auth.*sufficient.*pam_tid\.so' "$PAM_TID_FILE" 2>/dev/null; then
      echo "  ✓ Touch ID already enabled for sudo"
    else
      echo "→ Adding Touch ID support for sudo..."
      echo "$PAM_TID_LINE" >> "$PAM_TID_FILE"
      echo "  ✓ Touch ID enabled for sudo"
    fi
  else
    echo "→ Creating sudo Touch ID config..."
    echo "# sudo_local: local config file which survives system update and is included for sudo" > "$PAM_TID_FILE"
    echo "# Enable Touch ID for sudo authentication" >> "$PAM_TID_FILE"
    echo "$PAM_TID_LINE" >> "$PAM_TID_FILE"
    echo "  ✓ Touch ID enabled for sudo"
  fi
fi

# --- Build ---
echo "→ Building daemon..."
make -C "$SELF_DIR" build

echo "→ Building GUI app (this may take a while)..."
make -C "$SELF_DIR" app

# --- Install daemon binary ---
echo "→ Installing daemon to $BINARY_DST..."
mkdir -p /usr/local/bin
cp "$SELF_DIR/build/$BINARY_NAME" "$BINARY_DST"
chown root:wheel "$BINARY_DST"
chmod 755 "$BINARY_DST"

# --- Install uninstall command ---
echo "→ Installing uninstall command to $UNINSTALL_DST..."
if [[ -f "$SELF_DIR/build/$UNINSTALL_NAME" ]]; then
  cp "$SELF_DIR/build/$UNINSTALL_NAME" "$UNINSTALL_DST"
  chown root:wheel "$UNINSTALL_DST"
  chmod 755 "$UNINSTALL_DST"
fi

# --- Install .app ---
echo "→ Installing GUI to $APP_DST..."
rm -rf "$APP_DST"
ditto "$SELF_DIR/build/$APP_NAME.app" "$APP_DST"
chown -R root:wheel "$APP_DST"
# Clear quarantine xattr so unsigned app launches without "damaged" error
xattr -cr "$APP_DST" 2>/dev/null || true

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
/bin/launchctl kickstart -k system/com.s4wbvnny.bettertether 2>/dev/null || true

echo ""
echo "✓ BetterTether installed!"
echo "  GUI:  $APP_DST"
echo "  Logs: $LOG_FILE"
echo ""
echo "Launch BetterTether.app from your Applications folder."
echo "To uninstall: drag BetterTether.app to Trash, or run: sudo bash uninstall.sh"
