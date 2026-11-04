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


- Final build verified. NSIS installer created at elease\RemoteDock-Setup-1.0.0.exe. Bundled ADB and ssh2 verified in win-unpacked.
