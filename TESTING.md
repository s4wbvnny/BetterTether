# BetterTether — Testing Guide

How to test BetterTether at every stage of development.

---

## Test Layers

### 1. Unit Tests (no hardware needed)
Run: `make test`  
Location: `internal/*/..._test.go`, `config/`

No USB device and no utun interface are required; every test exercises pure
functions and builds its own input buffers inline.

What is covered today:
- `internal/rndis/messages_test.go` — marshalling and parsing for every RNDIS control message, including the short-buffer and out-of-bounds branches
- `internal/rndis/mac_test.go` — MAC address extraction, including the truncated payload that used to panic the daemon
- `internal/daemon/relay_test.go` — MAC auto-detection and status reporting for short and mismatched addresses
- `config/config_test.go` — omitted config sections keep their defaults, and explicit values win

Not covered yet (needs a mock USB layer, which does not exist):
- RNDIS handshake sequencing, USB interface claiming, utun framing, DHCP/ARP parsing

### 2. Integration Tests
Not implemented. `make test-integration` points at `test/integration/`, which does
not exist yet. Until it does, exercise utun creation by running the daemon in the
foreground:

```bash
sudo ./build/bettertether -config ./config/default.toml
```

### 3. Live End-to-End Test (requires phone)
Run: `make test-live`  
Script: `scripts/test-live.sh`

Prerequisites:
- Samsung or Android phone connected via USB
- USB Tethering enabled on the phone
- Running as root (or via sudo)

What the script checks:
1. `bettertether` binary finds the USB device
2. RNDIS handshake completes (check log output)
3. utun interface appears (`ifconfig | grep utun` — the kernel names it utunN)
4. DHCP assigns an IP
5. `ping -c 3 -I utun6 8.8.8.8` succeeds (use the actual utunN name)
6. Unplugging phone tears down cleanly

---

## Running Tests

```bash
# All unit tests
make test

# Unit tests with verbose output
make test-v

# With race detector
make test-race

# Integration tests (root required)
make test-integration

# Live end-to-end test (phone required, root required)
make test-live

# Run a single package
go test ./internal/rndis/...

# Run a single test function
go test ./internal/rndis/... -run TestControlMessageMarshalling
```

---

## Development Hot-Reload

During active development, use the dev loop:

```bash
# Terminal 1: watch for changes, rebuild, restart daemon
make dev

# Terminal 2: tail the daemon log
tail -f /var/log/bettertether.log
```

`make dev` runs `scripts/dev-reload.sh` which:
1. Kills the running bettertether daemon (if any)
2. Rebuilds the binary
3. Restarts it in foreground mode (no launchd, logs to stdout)
4. Watches for file changes via `fswatch` and repeats

Install fswatch: `brew install fswatch`

---

## Test Fixtures and Mocks

There are no binary fixture files and no mock USB device yet. Tests build their
input buffers inline and assert on the same bytes they pass in. If you capture a
real exchange, add it as a case in `internal/rndis/messages_test.go` rather than
committing a binary blob.

## Checking the Daemon

```bash
# Is it running?
launchctl list | grep bettertether

# Check logs
tail -f /var/log/bettertether.log

# Manual start/stop (during development)
sudo launchctl load /Library/LaunchDaemons/com.s4wbvnny.bettertether.plist
sudo launchctl unload /Library/LaunchDaemons/com.s4wbvnny.bettertether.plist

# Force restart
sudo launchctl kickstart -k system/com.s4wbvnny.bettertether
```

---

## 🚀 Performance Benchmarks (Real-world)

Use these results as the "Gold Standard" to verify future optimizations or regressions.

| Device | Network | MAC/Host | OS | Result |
|--------|---------|----------|----|--------|
| Galaxy S24 | Airtel 5G | MacBook Air M4 | Android 16 | 290 Mbps (DL) / 41 Mbps (UL) |
| Galaxy A55 | Jio 5G | MacBook Air M4 | Android 16 | 180 Mbps (DL) / 25 Mbps (UL) |

*Tests performed via fast.com and `ping 8.8.8.8`. Zero packet loss verified.*

---

## What to Test When

| Stage | Run |
|-------|-----|
| After changing `internal/rndis/` | `go test ./internal/rndis/...` |
| After changing `internal/usb/` | `go test ./internal/usb/...` |
| Before every commit | `make test` |
| Before every git push | `make test && make test-race` |
| After reaching v0.5.0 | `make test-integration` |
| Before v1.0.0 release | `make test-live` with Samsung + Pixel device |