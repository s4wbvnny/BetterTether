# BetterTether

**Seamless Android RNDIS USB tethering for Apple Silicon Macs.**
*No Kernel Extensions. No SIP Changes. No Reboots.*

![Downloads](https://img.shields.io/github/downloads/s4wbvnny/BetterTether/total?style=for-the-badge&color=green)
![Status](https://img.shields.io/github/v/release/s4wbvnny/BetterTether?style=for-the-badge&color=blue)

BetterTether is a lightweight userspace daemon that brings high-performance USB tethering to macOS by implementing the RNDIS protocol via `libusb` and routing traffic through the native `utun` interface. It ships with a native macOS desktop app for controlling the daemon, monitoring traffic, and viewing logs from the menu bar.

---

## Why BetterTether?

- **Zero System Security Changes**: Unlike HoRNDIS, BetterTether runs entirely in userspace. You don't need to disable System Integrity Protection (SIP) or allow reduced security mode.
- **Apple Silicon Native**: Built from the ground up for M1, M2, M3, M4 and M5 Macs.
- **Samsung Friendly**: Includes a specialized workaround for Samsung's dynamic MAC address randomization on tethering interfaces.
- **Plug & Play**: Automatically detects your phone, performs the handshake, and configures your Mac's routing/DNS instantly.
- **Desktop GUI**: Native macOS app with power button, traffic stats, log viewer, settings panel (uninstall, clear logs), and system tray menu — quits cleanly without leaving the daemon running.

---

## macOS 15+ (Tahoe) Compatibility Guide

macOS 15 introduces a strict "System Trust" model for network interfaces. BetterTether operates within these boundaries, leading to a split-networking experience:

### Works Out-of-the-Box (Independent Apps)
Apps that use their own internal network or DNS libraries (DNS-over-HTTPS) bypass the OS "reachability" checks and work at full speed instantly:
*   **Browsers**: Chrome, Firefox, Brave, Microsoft Edge.
*   **Meetings**: Google Meet, Zoom, Slack, Microsoft Teams.
*   **Streaming**: Netflix, YouTube, Spotify, Twitch.
*   **Developer Tools**: Any connection to a raw IP address.

### Safari, App Store, and System Updates (Fixed)
BetterTether properly registers the `utun` interface as the **primary network service** in the System Configuration dynamic store. Safari, App Store, and system software updates work without any extra configuration.

### Pages Hanging or Spinning Forever? (The MTU Black Hole)
If you can ping `8.8.8.8` but websites fail to load, your mobile carrier might be dropping packets that are too large (a common 5G tethering issue). Fix by lowering the interface MTU to 1380:
```bash
sudo ifconfig utun6 mtu 1380
```

---

## Security & Privacy Posture

BetterTether is built on a strict **"local-only"** and **"least-privilege"** security model.

### Zero Telemetry & Data Sovereignty
- **No Data Inspection**: BetterTether simply routes encrypted and unencrypted packets between the macOS kernel (`utun`) and the Android USB interface (`libusb`). It **does not** read, inspect, or modify the contents of your web traffic.
- **No Analytics**: There is absolutely zero telemetry, tracking, or "call-home" functionality.
- **Local Logs Only**: Operational logs reside strictly on your local machine at `/var/log/bettertether.log`.

### Why `sudo` (Root) is Required
1. **Virtual Interface Creation**: Creating the `utun` interface requires kernel routing permissions.
2. **Routing Table Modification**: Injecting routes to prioritize the Android connection requires root.
3. **Hardware USB Binding**: Opening raw protocol communication via `libusb` requires device-level access.

### 100% Auditable Core
The core routing logic is written in modern Go and consists of fewer than **2,000 lines of code**, making it trivially auditable.

---

## Installation

### Option 1: Download the DMG
Download the latest `BetterTether-*.dmg` from the [Releases](https://github.com/s4wbvnny/BetterTether/releases) page. Mount it and drag `BetterTether.app` to your Applications folder.

**First launch:** Since BetterTether is downloaded from the internet, macOS Gatekeeper will block it the first time you open it. To allow it:
1. Try to open BetterTether — you'll see *"BetterTether can't be opened"*.
2. Go to **System Settings → Privacy & Security**.
3. Scroll down — you'll see a message about BetterTether being blocked. Click **Open Anyway**.
4. Enter your password when prompted.

This only needs to be done once. After that, BetterTether opens normally.

The app will install the background daemon on first launch (requires admin password).

### Option 2: One-Liner Install
```bash
curl -sL https://raw.githubusercontent.com/s4wbvnny/BetterTether/main/install.sh | sudo bash
```

### Option 3: Build from Source

**Prerequisites:**
```bash
brew install libusb pkg-config go node
```

**Build the daemon + GUI app:**
```bash
git clone https://github.com/s4wbvnny/BetterTether
cd BetterTether
make app
```

The `.app` bundle will be at `build/BetterTether.app`. Drag it to Applications.

**Or build a DMG installer:**
```bash
cd gui
npm run build
npx electron-builder --mac dmg --arm64 --x64
```

DMGs will be in `gui/dist/`.

---

## How to Use

1. **Launch BetterTether.app** — it appears in the menu bar and dock.
2. **Connect** your Android phone to your Mac via USB-C.
3. **Enable USB Tethering** on your phone (Settings > Tethering > USB Tethering).
4. Click the **power button** in the app to start the daemon.

The app shows real-time traffic stats (uploaded/downloaded), connection status, and a live log viewer. Use the Settings panel to clear logs or fully uninstall the daemon. Quitting via Cmd+Q or the tray menu stops the daemon cleanly but keeps it installed for next time.

---

## Uninstalling

### Uninstall Command
If `bettertether-uninstall` was installed alongside the daemon:
```bash
sudo bettertether-uninstall
```

### Manual
```bash
sudo bash uninstall.sh
```
---

## Troubleshooting

### "BetterTether can't be opened"
macOS Gatekeeper blocks apps downloaded from the internet that aren't signed with an Apple Developer ID. BetterTether is ad-hoc signed, so you need to approve it once:

1. Go to **System Settings → Privacy & Security**.
2. Scroll down to the **Security** section.
3. Click **Open Anyway** next the BetterTether message.
4. Enter your password.

Alternatively, you can clear the quarantine flag from the terminal:
```bash
sudo xattr -rd com.apple.quarantine /Applications/BetterTether.app
```
Then relaunch BetterTether. Either method only needs to be done once after installing from a DMG download.

---

## Community
*   **Contributing**: See [CONTRIBUTING.md](CONTRIBUTING.md).
*   **Security**: Report vulnerabilities via our [Security Policy](.github/SECURITY.md).
*   **License**: MIT

---

## Verified Test Environment

| Phone | Android | Mac | macOS |
|---|---|---|---|
| Samsung Galaxy S24 | 16 (One UI 8.0) | MacBook M3 Pro | Tahoe |
| Samsung Galaxy A55 | 16 (One UI 8.0) | MacBook M5 | Tahoe |
| Samsung Galaxy s9 | 15 (DuhanROM 4.3) | MacBook M3 Pro | Tahoe |
