# Restore In-App Update Checker onto 0.9.0 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the exact 0.9.1 in-app update-checker feature onto the current 0.9.0 build — version stays 0.9.0, the `v0.9.0` tag is force-moved, and the GitHub v0.9.0 release gets the rebuilt DMGs.

**Architecture:** The update-checker code already exists at HEAD (`ede0d85`); the working tree stripped it. Restore the 5 pure-strip source files verbatim from HEAD via `git checkout HEAD -- <file>`, restore `main/index.ts` from HEAD then re-insert the two `xattr` quarantine lines that exist only in the working tree, keep `VERSIONS.md`/`gui/package.json`/`gui/resources/bettertether-uninstall` at their working-tree (0.9.0) state, then rebuild both DMGs and release as v0.9.0.

**Tech Stack:** Electron 41, electron-vite 5, electron-builder 26, React 19 + TypeScript, Go daemon (unchanged), GitHub CLI (`gh`).

## Global Constraints

- Version must stay **0.9.0** in `VERSIONS.md` and `gui/package.json` — do NOT bump.
- Release tag stays **v0.9.0**; existing tag `v0.9.0` currently points at `ab27d03` (`680123a` commit subject) and will be **force-moved** to the new commit.
- Restore the **exact** update-checker feature from HEAD `ede0d85`; do not write a new implementation.
- `gui/src/main/index.ts` MUST keep the two working-tree `xattr` lines (see Task 2).
- DMG artifact naming: `BetterTether-${version}-${arch}.${ext}` → `BetterTether-0.9.0-arm64.dmg`, `BetterTether-0.9.0-x64.dmg` (from `gui/electron-builder.yml`).
- Daemon binaries are unchanged (already 0.9.0): native arm64 `build/bettertether`, x64 `build/bettertether-x64-fixed` (libusb path already fixed with `install_name_tool`).
- No changes to `.github/` release workflow.

---

### Task 1: Restore the 5 pure-strip source files from HEAD

**Files:**
- Restore (overwrite working tree from HEAD): `gui/src/shared/channels.ts`, `gui/src/shared/types.ts`, `gui/src/preload/index.ts`, `gui/src/preload/index.d.ts`, `gui/src/renderer/src/components/SettingsPanel.tsx`

**Interfaces:**
- Consumes: HEAD commit `ede0d85` as the source of truth.
- Produces: `IPC.CHECK_FOR_UPDATES` / `IPC.DOWNLOAD_UPDATE` / `IPC.CANCEL_UPDATE` / `IPC.RESTART_FOR_UPDATE` / `IPC.ON_UPDATE_PROGRESS` channel constants; `UpdateInfo` / `UpdateProgress` types; preload API methods `checkForUpdates()`, `downloadUpdate()`, `cancelUpdate()`, `restartForUpdate()`, `onUpdateProgress(cb)`; the `Window['bettertether']` type surface (all consumed by Tasks 2-3).

- [ ] **Step 1: Restore the 5 files from HEAD**

Run:
```bash
git checkout HEAD -- \
  gui/src/shared/channels.ts \
  gui/src/shared/types.ts \
  gui/src/preload/index.ts \
  gui/src/preload/index.d.ts \
  gui/src/renderer/src/components/SettingsPanel.tsx
```

- [ ] **Step 2: Verify these 5 files now match HEAD**

Run:
```bash
git diff HEAD --stat -- \
  gui/src/shared/channels.ts \
  gui/src/shared/types.ts \
  gui/src/preload/index.ts \
  gui/src/preload/index.d.ts \
  gui/src/renderer/src/components/SettingsPanel.tsx
```
Expected: empty output (no diff). Also confirm the restore landed:
```bash
git show HEAD:gui/src/shared/channels.ts | grep -c "check-for-updates"   # expect 1
grep -c "check-for-updates" gui/src/shared/channels.ts                    # expect 1
```
And `SettingsPanel.tsx` is large again (full UI restored, ~188-line delta gone):
```bash
git diff HEAD --stat -- gui/src/renderer/src/components/SettingsPanel.tsx  # expect empty
```

- [ ] **Step 3: Commit**

```bash
git add gui/src/shared/channels.ts gui/src/shared/types.ts \
        gui/src/preload/index.ts gui/src/preload/index.d.ts \
        gui/src/renderer/src/components/SettingsPanel.tsx
git commit -m "Restore in-app update checker: shared IPC channels and types, preload API, settings UI"
```

---

### Task 2: Restore main/index.ts from HEAD and re-apply the xattr quarantine lines

**Files:**
- Restore: `gui/src/main/index.ts` (overwrite working tree from HEAD)
- Modify: `gui/src/main/index.ts` (re-insert two `xattr` lines)

**Interfaces:**
- Consumes: channel constants and `UpdateInfo`/`UpdateProgress` types from Task 1.
- Produces: IPC handlers for `bt:check-for-updates`, `bt:download-update`, `bt:cancel-update`, `bt:restart-for-update`, `bt:update-progress`; the `checkForUpdates()` / `downloadUpdate()` / `stageUpdate()` / `restartForUpdate()` / `cancelUpdate()` functions; `GITHUB_REPO = 's4wbvnny/BetterTether'`. SettingsPanel (Task 1) invokes the preload bridge which routes to these handlers.

- [ ] **Step 1: Restore main/index.ts from HEAD**

Run:
```bash
git checkout HEAD -- gui/src/main/index.ts
```

- [ ] **Step 2: Re-insert the two xattr quarantine lines**

HEAD's install script body (around line 289) is:
```
cp -f '${binaryRes}' ${DAEMON_PATH}
chmod +x ${DAEMON_PATH}
cp -f '${plistRes}' ${PLIST_PATH}
```
Insert after `chmod +x ${DAEMON_PATH}`:
```
xattr -dr com.apple.quarantine ${DAEMON_PATH} 2>/dev/null || true
xattr -dr com.apple.quarantine ${UNINSTALL_PATH} 2>/dev/null || true
```

Edit `gui/src/main/index.ts`, replacing:
```ts
cp -f '${binaryRes}' ${DAEMON_PATH}
chmod +x ${DAEMON_PATH}
cp -f '${plistRes}' ${PLIST_PATH}
```
with:
```ts
cp -f '${binaryRes}' ${DAEMON_PATH}
chmod +x ${DAEMON_PATH}
xattr -dr com.apple.quarantine ${DAEMON_PATH} 2>/dev/null || true
xattr -dr com.apple.quarantine ${UNINSTALL_PATH} 2>/dev/null || true
cp -f '${plistRes}' ${PLIST_PATH}
```

- [ ] **Step 3: Verify only the intended diff remains vs HEAD**

Run:
```bash
git diff HEAD -- gui/src/main/index.ts
```
Expected: exactly the two added `xattr` lines, nothing else. Confirm the update-checker functions are present in the file:
```bash
grep -n "GITHUB_REPO\|releases/latest\|function downloadUpdate\|function stageUpdate\|function restartForUpdate\|function cancelUpdate" gui/src/main/index.ts
```

- [ ] **Step 4: Commit**

```bash
git add gui/src/main/index.ts
git commit -m "Restore in-app update checker: main-process check/download/stage/restart logic (keep quarantine xattr fix)"
```

---

### Task 3: Type-check and build the GUI with the restored feature

**Files:**
- Build output: `gui/out/` (electron-vite), then packaged app.

**Interfaces:**
- Consumes: Tasks 1-2 (all 6 source files restored).
- Produces: compiled renderer/preload/main bundles with the update-checker code (verified in `gui/out/main/index.js`); a packageable app for Task 4.

- [ ] **Step 1: Confirm Go daemon tests still pass (unchanged)**

Run (repo root):
```bash
go test ./...
```
Expected: all packages pass (no test files in this repo, so output is `[no test files]` per package + `ok` lines).

- [ ] **Step 2: Build the GUI (type-check + compile)**

Run:
```bash
npm run build
```
in `gui/` (use `workdir: /opt/clones/DroidTether/gui`). Expected: electron-vite completes without TS errors; `gui/out/main/index.js` produced.

- [ ] **Step 3: Verify the compiled main bundle contains the update checker**

Run:
```bash
grep -c "check-for-updates\|releases/latest" gui/out/main/index.js   # expect >= 1
grep -c "bt:update-progress" gui/out/main/index.js                    # expect 1
```
Also verify the preload bundle exposes the API:
```bash
grep -c "checkForUpdates" gui/out/preload/index.js                   # expect >= 1
```

- [ ] **Step 4: Commit the build output if `out/` is tracked**

Check whether `gui/out/` is tracked:
```bash
git check-ignore gui/out/main/index.js; echo "exit=$?"
```
If exit 0 (ignored), no commit needed — proceed. If tracked, `git add gui/out && git commit -m "chore: rebuild GUI with update checker"`.

---

### Task 4: Rebuild both DMGs (arm64 and x64)

**Files:**
- Stage: `gui/resources/bettertether` (gitignored) ← daemon binary per arch
- Build: `gui/dist/BetterTether-0.9.0-arm64.dmg`, `gui/dist/BetterTether-0.9.0-x64.dmg` (+ blockmaps)
- Cleanup: `gui/dist/mac*` app dirs, `gui/dist/latest-mac.yml`, stale 0.9.1 artifacts

**Interfaces:**
- Consumes: `gui/out/` from Task 3; `electron-builder` config in `gui/electron-builder.yml` (`extraResources` pulls `resources/bettertether`, `resources/bettertether-uninstall`, plist, config, icons); daemon binaries `build/bettertether` (arm64) and `build/bettertether-x64-fixed` (x64).
- Produces: two DMGs containing the update-checker GUI + correct daemon per arch. Consumed by Tasks 5-6.

- [ ] **Step 1: Stage the arm64 daemon and build the arm64 DMG**

Run (from repo root):
```bash
cp build/bettertether gui/resources/bettertether
cp build/bettertether-uninstall gui/resources/bettertether-uninstall
cd gui && npx electron-builder --publish never --mac dmg --arm64
```
Expected: `gui/dist/BetterTether-0.9.0-arm64.dmg` + `.blockmap` created (the existing arm64 DMG from the stripped build is overwritten).

- [ ] **Step 2: Verify arm64 app is correct before cleanup**

Run:
```bash
file gui/dist/mac-arm64/BetterTether.app/Contents/MacOS/BetterTether
codesign -dv --verbose=4 gui/dist/mac-arm64/BetterTether.app 2>&1 | grep "Signature\|Identifier"
grep -c "check-for-updates" gui/dist/mac-arm64/BetterTether.app/Contents/Resources/app.asar 2>/dev/null || \
  npx asar list gui/dist/mac-arm64/BetterTether.app/Contents/Resources/app.asar | grep -q out/main && echo "asar present"
```
Expected: Mach-O `arm64`; `Signature=adhoc`; app.asar present (contains `out/main/index.js` with the update-checker code — verify by extracting or by the earlier `gui/out` check).

- [ ] **Step 3: Remove the arm64 app dir, then build the x64 DMG**

Run:
```bash
rm -rf gui/dist/mac-arm64
cp build/bettertether-x64-fixed gui/resources/bettertether
npx electron-builder --publish never --mac dmg --x64
```
Expected: `gui/dist/BetterTether-0.9.0-x64.dmg` + `.blockmap` created.

- [ ] **Step 4: Verify x64 app is correct before cleanup**

Run:
```bash
file gui/dist/mac/BetterTether.app/Contents/MacOS/BetterTether
codesign -dv --verbose=4 gui/dist/mac/BetterTether.app 2>&1 | grep "Signature\|Identifier"
otool -L gui/dist/mac/BetterTether.app/Contents/Resources/bettertether | grep libusb
```
Expected: Mach-O `x86_64`; `Signature=adhoc`; libusb dylib path resolved to `/usr/local/opt/libusb/lib/libusb-1.0.0.dylib` (no `@rpath`/tmp leftovers).

- [ ] **Step 5: Clean up build artifacts and stale files**

Run:
```bash
rm -rf gui/dist/mac gui/dist/mac-arm64
rm -f gui/dist/latest-mac.yml gui/dist/latest-mac.yml.blockmap
ls gui/dist
```
Expected: `gui/dist/` contains only `BetterTether-0.9.0-arm64.dmg`, `BetterTether-0.9.0-arm64.dmg.blockmap`, `BetterTether-0.9.0-x64.dmg`, `BetterTether-0.9.0-x64.dmg.blockmap`.

- [ ] **Step 6: Restore the native arm64 daemon into resources (final state)**

Run:
```bash
cp build/bettertether gui/resources/bettertether
```

---

### Task 5: Final repo verification before release

**Files:**
- `VERSIONS.md`, `gui/package.json`, `gui/resources/bettertether-uninstall`, all 6 restored source files, `gui/dist/*`.

**Interfaces:**
- Consumes: everything from Tasks 1-4.
- Produces: a clean, verified working tree ready to commit/release.

- [ ] **Step 1: Confirm versions are still 0.9.0**

Run:
```bash
grep '"version"' gui/package.json          # expect "0.9.0"
cat VERSIONS.md | grep -m1 '^## v'          # expect "## v0.9.0 — 2026-08-02"
```

- [ ] **Step 2: Confirm the 6 source files are exactly the intended content**

Run:
```bash
git diff -- gui/src/main/index.ts           # expect only the 2 xattr lines
git diff --stat -- gui/src/shared/ gui/src/preload/ gui/src/renderer/src/components/SettingsPanel.tsx
```
Expected: only `main/index.ts` differs from HEAD, and only by the two xattr lines. (`VERSIONS.md`, `gui/package.json`, `gui/resources/bettertether-uninstall` remain modified vs HEAD as the intended 0.9.0 state.)

- [ ] **Step 3: Re-run the full check suite**

Run:
```bash
go test ./... && cd gui && npm run build
```
Expected: all pass; `gui/out/main/index.js` contains the update-checker strings.

---

### Task 6: Commit the 0.9.0 restore and force-move the v0.9.0 tag

**Files:**
- All changes on `main`.

**Interfaces:**
- Consumes: Task 5 verified tree.
- Produces: a single release commit; `v0.9.0` tag pointing at it; pushed `main`. Consumed by Task 7.

- [ ] **Step 1: Review and commit all changes**

Run:
```bash
git status --short
git add -A
git commit -m "Restore in-app update checker (0.9.0)"
```
Expected: one commit including the 6 source files, `VERSIONS.md`, `gui/package.json`, `gui/resources/bettertether-uninstall`. `gui/dist/` and `gui/out/` must NOT be committed — verify they are gitignored:
```bash
git check-ignore gui/dist/BetterTether-0.9.0-arm64.dmg gui/out/main/index.js
```
(both should print, exit 0).

- [ ] **Step 2: Force-move the v0.9.0 tag to the new commit**

Run:
```bash
NEW_COMMIT=$(git rev-parse HEAD)
git tag -f v0.9.0 "$NEW_COMMIT"
git tag -l "v0.9.0" -n1
```
Expected: tag `v0.9.0` now points at the new commit (was `ab27d03`).

- [ ] **Step 3: Push main and the force-moved tag**

Run:
```bash
git push origin main
git push origin v0.9.0 --force
```
Expected: both succeed.

---

### Task 7: Update the GitHub v0.9.0 release with the new DMGs

**Files:**
- `gui/dist/BetterTether-0.9.0-arm64.dmg` and `.blockmap`
- `gui/dist/BetterTether-0.9.0-x64.dmg` and `.blockmap`

**Interfaces:**
- Consumes: Task 6 pushed tag/release.
- Produces: GitHub v0.9.0 release whose `latest` resolves correctly with the two rebuilt DMGs.

- [ ] **Step 1: Inspect the existing release**

Run:
```bash
gh release view v0.9.0
```
Expected: shows the existing v0.9.0 release, its title/notes, and its current DMG assets (built without the update checker — these will be replaced).

- [ ] **Step 2: Delete the stale DMG assets**

Run:
```bash
gh release delete-asset v0.9.0 BetterTether-0.9.0-arm64.dmg --yes
gh release delete-asset v0.9.0 BetterTether-0.9.0-x64.dmg --yes
```
(If asset names differ, list them first with `gh release view v0.9.0 --json assets --jq '.assets[].name'`.)

- [ ] **Step 3: Upload the new DMGs (and blockmaps)**

Run:
```bash
gh release upload v0.9.0 \
  gui/dist/BetterTether-0.9.0-arm64.dmg \
  gui/dist/BetterTether-0.9.0-arm64.dmg.blockmap \
  gui/dist/BetterTether-0.9.0-x64.dmg \
  gui/dist/BetterTether-0.9.0-x64.dmg.blockmap \
  --clobber
```
Expected: all four assets uploaded.

- [ ] **Step 4: Confirm the release is correct**

Run:
```bash
gh release view v0.9.0 --json tagName,assets --jq '{tag: .tagName, assets: [.assets[].name]}'
```
Expected: `tag: v0.9.0` with the four new asset filenames. Also confirm the API the update checker uses resolves to this release:
```bash
curl -s https://api.github.com/repos/s4wbvnny/BetterTether/releases/latest | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['tag_name']); print([a['name'] for a in d['assets']])"
```
Expected: `v0.9.0` and the two `*-arm64.dmg` / `*-x64.dmg` asset names.

- [ ] **Step 5: Final end-to-end check**

Confirm the restored update checker will report "up to date" given the app is 0.9.0 and latest is v0.9.0:
- `parseSemver('v0.9.0')` → `[0,9,0]`, `app.getVersion()` → `0.9.0` → `[0,9,0]` → equal → `available: false`. (Logic is in `gui/src/main/index.ts` `checkForUpdates()`; no runtime test needed, the semver comparison is already verified by code review in Task 2.)
