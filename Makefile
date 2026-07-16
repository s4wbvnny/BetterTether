.PHONY: build test test-v test-race test-integration test-live dev clean release fmt vet lint version

BINARY     = bettertether
BUILD_DIR  = ./build
CMD        = ./cmd/bettertether
GOARCH     = arm64
GOOS       = darwin
CGO        = 1

# Suppress Apple Double (._) files during file operations
export COPYFILE_DISABLE=1

# ──────────────────────────────────────────────
# Build
# ──────────────────────────────────────────────

build:
	@echo "→ Building $(BINARY) for $(GOOS)/$(GOARCH)..."
	GOARCH=$(GOARCH) GOOS=$(GOOS) CGO_ENABLED=$(CGO) \
		go build -ldflags="-X main.version=$(shell cat VERSIONS.md | grep '^## v' | head -1 | awk '{print $$2}')" \
		-o $(BUILD_DIR)/$(BINARY) $(CMD)
	@echo "✓ Built: $(BUILD_DIR)/$(BINARY)"

build-intel:
	@echo "→ Building $(BINARY) for darwin/amd64..."
	GOARCH=amd64 GOOS=darwin CGO_ENABLED=1 \
		go build -o $(BUILD_DIR)/$(BINARY)-amd64 $(CMD)

clean:
	rm -rf $(BUILD_DIR)/
	@echo "✓ Cleaned"

# ──────────────────────────────────────────────
# Test
# ──────────────────────────────────────────────

test:
	go test ./...

test-v:
	go test -v ./...

test-race:
	go test -race ./...

test-integration:
	@echo "→ Integration tests (requires root for utun creation)"
	sudo go test -tags integration -v ./test/integration/...

test-live:
	@echo "→ Live end-to-end test (requires phone attached + USB tethering ON)"
	@echo "→ Running as sudo..."
	sudo bash scripts/test-live.sh

# ──────────────────────────────────────────────
# Development
# ──────────────────────────────────────────────

dev:
	@echo "→ Starting dev hot-reload loop (requires fswatch: brew install fswatch)"
	@bash scripts/dev-reload.sh

install-local: build
	@echo "→ Installing $(BINARY) to /usr/local/bin/ (requires sudo)"
	sudo cp $(BUILD_DIR)/$(BINARY) /usr/local/bin/$(BINARY)
	sudo bash scripts/install-launchd.sh
	@echo "✓ Installed and daemon started"

uninstall-local:
	sudo bash scripts/uninstall-launchd.sh
	sudo rm -f /usr/local/bin/$(BINARY)
	@echo "✓ Uninstalled"

logs:
	tail -f /var/log/bettertether.log

daemon-status:
	launchctl list | grep bettertether || echo "bettertether daemon not running"

daemon-restart:
	sudo launchctl kickstart -k system/com.princePal.bettertether

# ──────────────────────────────────────────────
# Code Quality
# ──────────────────────────────────────────────

fmt:
	gofmt -w .

vet:
	go vet ./...

lint:
	@which golangci-lint > /dev/null || (echo "Install: brew install golangci-lint" && exit 1)
	golangci-lint run

# ──────────────────────────────────────────────
# Release
# ──────────────────────────────────────────────

release: test test-race build
	@VERSION=$$(cat VERSIONS.md | grep '^## v' | head -1 | awk '{print $$2}'); \
	echo "→ Tagging release $$VERSION"; \
	git tag -a $$VERSION -m "Release $$VERSION"; \
	echo "→ Push tag with: git push origin $$VERSION"; \
	echo "→ GitHub Actions will build + publish the release"

version:
	@cat VERSIONS.md | grep '^## v' | head -1 | awk '{print $$2}'

# ──────────────────────────────────────────────
# Menu Bar App (.app)
# ──────────────────────────────────────────────

UI_APP_NAME  = BetterTether
UI_BINARY    = bettertether-ui
UI_SRC       = ./cmd/bettertether-ui
UI_APP_DIR   = $(BUILD_DIR)/$(UI_APP_NAME).app
UI_ICON_SRC    = BetterTether.icns

# Generate the shield icon PNGs, then build the menu-bar binary
.PHONY: ui-icons
ui-icons:
	go run scripts/gen-icons.go

.PHONY: build-ui
build-ui: ui-icons
	@echo "→ Building $(UI_BINARY)..."
	go build -o $(BUILD_DIR)/$(UI_BINARY) $(UI_SRC)
	@echo "✓ Built: $(BUILD_DIR)/$(UI_BINARY)"

# Build a macOS .app bundle for the menu-bar UI
.PHONY: app
app: build-ui
	@echo "→ Building $(UI_APP_NAME).app..."
	-rm -rf $(UI_APP_DIR) 2>/dev/null
	mkdir -p $(UI_APP_DIR)/Contents/MacOS
	mkdir -p $(UI_APP_DIR)/Contents/Resources
	cp $(BUILD_DIR)/$(UI_BINARY) $(UI_APP_DIR)/Contents/MacOS/$(UI_APP_NAME)
	cp $(UI_ICON_SRC) $(UI_APP_DIR)/Contents/Resources/BetterTether.icns
	sed "s/VERSION/$(PKG_VERSION)/g" pkg/BetterTether-Info.plist > $(UI_APP_DIR)/Contents/Info.plist
	@echo "✓ App bundle: $(UI_APP_DIR)"

# ──────────────────────────────────────────────
# Package (.pkg)
# ──────────────────────────────────────────────

# Compute once: scripts prints e.g. "1.0.3" from VERSIONS.md
PKG_VERSION   = $(shell sh scripts/version.sh)
PKG_ROOT      = $(BUILD_DIR)/pkgroot
PKG_SCRIPTS   = pkg/scripts
PKG_RESOURCES = pkg/Resources
PKG_OUTPUT    = $(BUILD_DIR)/BetterTether-$(PKG_VERSION).pkg

# Build the staging directory for the daemon component (no .app!)
.PHONY: pkgroot
pkgroot: build
	@echo "→ Preparing daemon package root..."
	rm -rf $(PKG_ROOT)
	mkdir -p $(PKG_ROOT)/usr/local/bin
	mkdir -p $(PKG_ROOT)/Library/LaunchDaemons
	mkdir -p $(PKG_ROOT)/etc/bettertether
	mkdir -p $(PKG_ROOT)/var/log
	cp $(BUILD_DIR)/$(BINARY) $(PKG_ROOT)/usr/local/bin/$(BINARY)
	cp launchd/com.princePal.bettertether.plist $(PKG_ROOT)/Library/LaunchDaemons/com.princePal.bettertether.plist
	cp config/default.toml $(PKG_ROOT)/etc/bettertether/bettertether.toml
	touch $(PKG_ROOT)/var/log/.bettertether-placeholder
	@echo "✓ Daemon package root ready at $(PKG_ROOT)"

# Build unsigned .pkg (suitable for local/CI use)
.PHONY: pkg
pkg: pkgroot app
	@echo "→ Building BetterTether-$(PKG_VERSION).pkg..."
	# 1. Daemon component (binary + plist + config)
	pkgbuild --root $(PKG_ROOT) \
		--scripts $(PKG_SCRIPTS) \
		--identifier com.princePal.bettertether \
		--version $(PKG_VERSION) \
		--install-location / \
		$(BUILD_DIR)/bettertether-daemon.pkg
	# 2. GUI app component (uses --component so it lands in /Applications properly)
	pkgbuild --component $(UI_APP_DIR) \
		--identifier com.princePal.bettertether-ui \
		--version $(PKG_VERSION) \
		--install-location /Applications \
		$(BUILD_DIR)/bettertether-ui.pkg
	# 3. Combine into a distribution package
	productbuild --distribution pkg/Distribution.xml \
		--resources $(PKG_RESOURCES) \
		--package-path $(BUILD_DIR) \
		$(PKG_OUTPUT)
	rm -f $(BUILD_DIR)/bettertether-daemon.pkg
	rm -f $(BUILD_DIR)/bettertether-ui.pkg
	rm -rf $(PKG_ROOT)
	@echo "✓ Package built: $(PKG_OUTPUT)"
	@echo "  Install with: open $(PKG_OUTPUT)"

# Build developer-ID signed .pkg (for distribution)
.PHONY: pkg-signed
pkg-signed: build app
	@read -p "Apple Developer ID (e.g. 'Developer ID Installer: Name (TEAM)'): " SIGN_ID; \
	echo "→ Signing daemon component..."; \
	pkgbuild --root $(PKG_ROOT) \
		--scripts $(PKG_SCRIPTS) \
		--identifier com.princePal.bettertether \
		--version $(PKG_VERSION) \
		--sign "$$SIGN_ID" \
		--install-location / \
		$(BUILD_DIR)/bettertether-daemon.pkg; \
	echo "→ Signing GUI component..."; \
	pkgbuild --component $(UI_APP_DIR) \
		--identifier com.princePal.bettertether-ui \
		--version $(PKG_VERSION) \
		--sign "$$SIGN_ID" \
		--install-location /Applications \
		$(BUILD_DIR)/bettertether-ui.pkg; \
	echo "→ Building signed distribution package..."; \
	productbuild --distribution pkg/Distribution.xml \
		--resources $(PKG_RESOURCES) \
		--package-path $(BUILD_DIR) \
		--sign "$$SIGN_ID" \
		$(PKG_OUTPUT); \
	rm -f $(BUILD_DIR)/bettertether-daemon.pkg; \
	rm -f $(BUILD_DIR)/bettertether-ui.pkg; \
	rm -rf $(PKG_ROOT); \
	echo "✓ Signed package built: $(PKG_OUTPUT)"

# Notarize the signed .pkg (requires Apple ID + app-specific password)
.PHONY: pkg-notarize
pkg-notarize:
	@read -p "Apple ID: " APPLE_ID; \
	echo "→ Submitting $(PKG_OUTPUT) for notarization..."; \
	xcrun notarytool submit $(PKG_OUTPUT) \
		--apple-id "$$APPLE_ID" \
		--team-id "$(shell echo $$SIGN_ID | grep -oE '\([^)]+\)' | tr -d '()')" \
		--wait; \
	echo "→ Stapling notarization ticket..."; \
	xcrun stapler staple $(PKG_OUTPUT); \
	echo "✓ Package notarized and stapled"

# ──────────────────────────────────────────────
# Help
# ──────────────────────────────────────────────

# ──────────────────────────────────────────────
# System Install / Uninstall
# ──────────────────────────────────────────────

install:
	sudo bash install.sh

uninstall:
	sudo bash uninstall.sh

help:
	@echo "BetterTether — Make Targets"
	@echo ""
	@echo "  build             Build arm64 binary"
	@echo "  test              Run all unit tests"
	@echo "  test-v            Run tests (verbose)"
	@echo "  test-race         Run tests with race detector"
	@echo "  test-integration  Run integration tests (needs root)"
	@echo "  test-live         Run live test (needs phone + root)"
	@echo "  dev               Hot-reload dev loop"
	@echo "  install           Install daemon + GUI to system (calls install.sh)"
	@echo "  uninstall         Remove daemon + GUI completely (calls uninstall.sh)"
	@echo "  install-local     Install daemon locally for testing"
	@echo "  uninstall-local   Remove local install"
	@echo "  logs              Tail daemon log"
	@echo "  daemon-restart    Restart the launchd daemon"
	@echo "  fmt               Format all Go code"
	@echo "  lint              Run golangci-lint"
	@echo "  release           Tag + prepare release"
	@echo "  version           Show current version"
	@echo "  app               Build BetterTether.app menu-bar UI bundle (requires libusb)"
	@echo "  build-ui          Build the menu-bar UI binary only"
	@echo "  pkg               Build unsigned .pkg installer (includes daemon + .app)"
	@echo "  pkg-signed        Build signed .pkg (requires Apple Developer ID)"
	@echo "  pkg-notarize      Notarize an already-signed .pkg"