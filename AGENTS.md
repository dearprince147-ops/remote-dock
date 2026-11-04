# Agent rules

1. Work **one phase at a time** (Section 12 of PLAN.md). After each phase run `npm run typecheck` and `npm run build`; fix every error before moving on.
2. Do **not** ask questions. If something is ambiguous, pick the simplest option consistent with this plan and leave a one-line note in `NOTES.md`.
3. No placeholders, no `TODO`, no fake data in final code. Every button must do something real.
4. Keep every file under ~300 lines. Split by responsibility as laid out in Section 4.
5. TypeScript `strict: true`. No `any` unless unavoidable (comment why).
6. Never block the main process: all file/network work is async and stream-based. Never read a whole file into memory.
7. Renderer has **no Node access**. All system access goes through the preload bridge (Section 7).
8. Windows-first: use `path` for local paths, `path.posix` for remote paths. Never mix.
9. Never delete or overwrite user data without a confirmation dialog (delete files, overwrite on conflict, cancel-and-delete partial).
10. Prefer fewer dependencies. Allowed dependencies are listed in Section 3; do not add others without a strong reason.
