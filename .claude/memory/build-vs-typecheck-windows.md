---
name: build-vs-typecheck-windows
description: Verifying Kairos changes on Windows — prefer typecheck, don't wait on stuck builds, kill port 3000 and clear .next when retrying.
metadata:
  type: feedback
---

On Windows, `npm run build` in this repo can hang silently or error with
`EPERM: operation not permitted, open '.next\trace'` when a previous dev server,
build, or Vercel CLI still holds a file lock on `.next/`. Sitting there waiting
for the build to finish wastes turns.

**Rule:**
- Verify diffs with `npm run typecheck`. It runs in seconds and surfaces the
  same TS errors that would fail `next build`.
- Treat `npm run build` as bundle-pipeline validation, not diff validation —
  only run it when there's a real reason (asset hashing, route output, etc.).
- If a local build hangs or EPERMs, **kill it and reset**:

  ```powershell
  Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique |
    ForEach-Object { Stop-Process -Id $_ -Force }
  Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
  ```

  Then retry once. Don't poll a stuck build with sleeps or monitors.

**Why:** User flagged that I spent multiple turns waiting on a build that was
locked on `.next/trace` after the actual code edits had taken seconds. The
typecheck had already passed. Real cost is wasted turns + cache misses, not
"the build might fail." Reflex should be: kill, clear, move on.

**How to apply:** First verification after a code change in this repo is
`npm run typecheck`. Only run `npm run build` if the user asks or the diff
touches build config / next.config / tailwind config / public assets. If a
build hangs, run the PowerShell snippet above and proceed.

See also CLAUDE.md "Build & dev hygiene (Windows)" for the same guidance in
the repo-level doc.
