# Design: Restore In-App Update Checker onto 0.9.0

Date: 2026-08-02
Status: Approved (design option A)

## Goal

Add the in-app update-checker feature (previously shipped in the 0.9.1
code, commit `484bcd9` / current HEAD `ede0d85`) to the current **0.9.0**
build — without bumping the version to 0.9.1. The release stays **v0.9.0**,
the existing `v0.9.0` tag is force-moved to the new commit, and the GitHub
v0.9.0 release's DMG assets are updated with the new builds.

## Background / current state

- **HEAD (`ede0d85`)**: `gui/package.json` version `0.9.1`, and the full
  update-checker feature present in 6 source files.
- **Working tree (uncommitted)**: version rolled back to `0.9.0`
  (`VERSIONS.md` + `gui/package.json`), and the update checker was stripped
  from those 6 source files.

The user wants the 0.9.1 update-checker code restored onto the 0.9.0 build,
version stays 0.9.0, release stays v0.9.0.

## What the update checker does (behavior to restore)

Source of truth: HEAD versions of the 6 files below (identical to what the
0.9.1 commit `484bcd9` introduced, apart from a later xattr fix — see below).

1. **IPC channels** (`gui/src/shared/channels.ts`):
   `bt:check-for-updates`, `bt:download-update`, `bt:cancel-update`,
   `bt:restart-for-update`, `bt:update-progress`.
2. **Types** (`gui/src/shared/types.ts`): `UpdateInfo`, `UpdateProgress`.
3. **Preload API** (`gui/src/preload/index.ts` + `index.d.ts`):
   `checkForUpdates()`, `downloadUpdate()`, `cancelUpdate()`,
   `restartForUpdate()`, `onUpdateProgress(cb)`.
4. **Main process** (`gui/src/main/index.ts`):
   - `GITHUB_REPO = 's4wbvnny/BetterTether'`.
   - `checkForUpdates()`: fetches `https://api.github.com/repos/s4wbvnny/BetterTether/releases/latest`
     (GitHub v3 Accept header), parses `tag_name`, `body`, `html_url`,
     picks the `*-<arch>.dmg` asset for the running arch
     (`process.arch === 'arm64' ? 'arm64' : 'x64'`), does a semver compare
     against `app.getVersion()`, returns `UpdateInfo`.
   - `downloadUpdate()`: downloads the DMG to `app.getPath('temp')`, streams
     with abort support, reports `UpdateProgress` (download %), then calls
     `stageUpdate()`.
   - `stageUpdate()`: `hdiutil attach` (read-only), finds the `.app`, `ditto`
     to `<userData>/update-stage`, verifies the `Contents/MacOS` executable,
     reports progress, detaches + cleans up the DMG.
   - `restartForUpdate()`: writes a detached shell script that waits for this
     PID to exit, `rm -rf`s the current app, `ditto`s the staged app into
     place, `open`s it; sets `forceQuit = true` and quits.
   - `cancelUpdate()`: aborts the active download controller.
   - IPC handlers for all 5 channels.
   - Progress is forwarded to the renderer via `ON_UPDATE_PROGRESS`.
5. **Settings UI** (`gui/src/renderer/src/components/SettingsPanel.tsx`):
   "Check for updates" row with a Check now button, checking indicator,
   available/ready/error/up-to-date states, download progress bar, Cancel,
   "Update now", "Restart now", "Later", "Dismiss" buttons. Uses
   `useRef` for a `cancelledRef` and `motion`/`AnimatePresence` progress bar.

Semver comparison: leading `v` stripped, `X.Y.Z` compared numerically. With
the latest release being v0.9.0 and the app at 0.9.0, the checker will
correctly report "You're on the latest version".

## Restoration approach (approved: option A)

**Restore the exact 0.9.1 feature code, version stays 0.9.0.**

### Files to restore from HEAD

| File | Action |
|------|--------|
| `gui/src/shared/channels.ts` | restore HEAD version (pure strip today) |
| `gui/src/shared/types.ts` | restore HEAD version (pure strip today) |
| `gui/src/preload/index.ts` | restore HEAD version (pure strip today) |
| `gui/src/preload/index.d.ts` | restore HEAD version (pure strip today) |
| `gui/src/renderer/src/components/SettingsPanel.tsx` | restore HEAD version (pure strip today) |
| `gui/src/main/index.ts` | restore HEAD version, **then re-apply the two `xattr -dr com.apple.quarantine` lines** that exist in the working tree but not in HEAD |

Note: the working tree's `main/index.ts` also contains lines 82-83:
```
xattr -dr com.apple.quarantine ${DAEMON_PATH} 2>/dev/null || true
xattr -dr com.apple.quarantine ${UNINSTALL_PATH} 2>/dev/null || true
```
These must be preserved. Restoring from HEAD wholesale would drop them, so
after restoring `main/index.ts` from HEAD, re-insert those two lines in the
same location (the `installForced` / script body area around
`chmod +x ${DAEMON_PATH}`).

### Files that stay exactly as the working tree has them

| File | Reason |
|------|--------|
| `VERSIONS.md` | already 0.9.0 (keep the 0.9.0 entry + the "Fixed x64 builds" line moved into it) |
| `gui/package.json` | already `"version": "0.9.0"` |
| `gui/resources/bettertether-uninstall` | rebuilt 0.9.0 uninstall binary (Go build metadata only; functionally identical) |

### Rebuild DMGs

Both DMGs must be rebuilt from the restored source so the update checker is
in the GUI:

1. `go test ./...` (repo root) — daemon unchanged, should pass.
2. `npm run build` in `gui/` (type-check + compile the renderer/preload/main
   with the restored update-checker code).
3. Stage the daemon binaries into `gui/resources/` per arch (arm64 native,
   x64 with `install_name_tool`-fixed libusb path) and run
   `electron-builder --publish never --mac dmg --arm64` / `--x64`.
4. Verify the new DMGs contain the update-checker code (e.g. the bundled
   main.js references `bt:check-for-updates` / `releases/latest`) and still
   have correct arch + ad-hoc signature.
5. Clean up stale DMG artifacts (0.9.1 builds, blockmaps, `latest-mac.yml`,
   `dist/mac*`) as before.

### Verification

- `go test ./...` passes.
- `npm run build` (gui) passes.
- Both DMGs built for correct arch; update-checker IPC strings present in the
  packaged app; ad-hoc code signature present.
- `VERSIONS.md` and `gui/package.json` remain 0.9.0.

### Release steps

1. Commit the restored feature (all 6 source files + unchanged 0.9.0
   VERSIONS.md/package.json already staged as-is). One commit message such as:
   "Restore in-app update checker (0.9.0)".
2. Force-move the existing `v0.9.0` tag to the new commit.
   (`git tag -f v0.9.0 <new-commit>` then push with `--force`.)
3. Push `main` to `origin`.
4. Update the GitHub v0.9.0 release: delete the old DMG assets, upload the
   two new DMGs (+ blockmaps if desired), keeping the existing release title
   and notes. Use `gh` (`gh release view v0.9.0`, `gh release upload`).
5. Confirm the latest release on GitHub is v0.9.0 with the new DMGs.

## Out of scope

- No version bump (stays 0.9.0).
- No new/different update-checker implementation — exact 0.9.1 feature.
- Daemon binaries unchanged (already at 0.9.0).
- No changes to the release workflow `.github/` files.
