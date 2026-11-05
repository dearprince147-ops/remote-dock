# Notes

Deviations and implementation decisions made while building per PLAN.md.

- Host-key prompts: `ssh2` requires a synchronous `hostVerifier`, so an unknown/changed key aborts the first
  connection attempt. The connect handler presents the prompt, stores the accepted fingerprint in
  `knownHosts.json`, and retries the connection transparently once.
- ADB `stat` parsing, `adb devices -l` parsing and `ls -la` fallback live in `src/main/devices/adbParse.ts`
  (pure module) so they can be unit-tested without Electron.
- Conflict policy `skip`: the existing target is left untouched, the `.part` file is removed and the transfer is
  marked done with a short note. `rename` creates `name (1).ext`; `overwrite` unlinks the target first on Windows.
- Source change detection uses a 2 second mtime tolerance, because some remote filesystems round timestamps.
- The transfer engine is Electron-free (`src/main/transfers/*`) so `tests/transferResume.test.ts` can run under
  vitest with a temporary directory `FakeProvider`.

## 1.0.2 previews

- In-app previews use a custom Electron protocol (`remotedock-preview://`) registered as a privileged, standard,
  streaming scheme. The main process resolves the device provider, checks the file, and streams it with HTTP
  `Range` support. Nothing is written to local disk during a preview.
- Text previews are capped at 512 KB and decoded as UTF-8. A NUL byte marks the file as binary and the dialog
  shows an unsupported-format message instead.
- Image thumbnails are generated with `nativeImage`, resized to fit 320x220, encoded as JPEG, and cached in memory
  with a 240-entry LRU. Thumbnails are skipped for images larger than 32 MB or formats Electron cannot decode.
- Video thumbnails are rendered by the renderer with a muted `<video preload="metadata">` element and a `#t=0.1`
  fragment. Unsupported codecs fall back to the normal file icon.
- Double-click on a file opens the preview dialog; folder double-click still navigates. The context menu keeps a
  separate Download action. No transfer is created by previewing.

## Builds

- 1.0.0: initial NSIS installer at `release/RemoteDock-Setup-1.0.0.exe`.
- 1.0.2: preview and thumbnail release at `release/RemoteDock-Setup-1.0.2.exe`.
