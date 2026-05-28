# Caching — make CI fast without breaking correctness

A cache that returns stale results is worse than no cache. The rules below come from the official `actions/cache` guide, the Next.js CI build-caching guide, and Playwright's CI docs.

## How caching works (in 30 seconds)

`actions/cache@v4` looks up a `key`. On exact match, it restores the cache and the job continues. On miss, the action falls back to `restore-keys` (prefix matches, evaluated in order). After the job's `post`-step, if no exact match was found, the action **saves** the current contents back to the `key`.

So your `key` is "the things that, if any of them change, the cache should be invalidated." Your `restore-keys` is "the slower-but-still-useful fallback when the key misses."

## 1. npm — use `setup-node`'s built-in cache

Don't write a manual `actions/cache` step for `node_modules` or `~/.npm`. `actions/setup-node` does it correctly:

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: 20
    cache: 'npm'
    # Default cache-dependency-path is `**/package-lock.json` — fine for single-package repos.
    # Override only for monorepos:
    # cache-dependency-path: |
    #   packages/**/package-lock.json
```

This caches `~/.npm` (the npm cache directory), keyed on `package-lock.json`. `npm ci` will use it on next install.

**Do not** also cache `node_modules` — `npm ci` does a fresh install from `~/.npm` and gets the same speedup without the risk of stale modules surviving a lockfile change.

## 2. Next.js `.next/cache` — verbatim from the Next.js docs

Next.js writes a build cache to `.next/cache` (page bundling, image optimization, etc.). Persisting it between runs cuts cold builds substantially. The official pattern:

```yaml
- uses: actions/cache@v4
  with:
    path: |
      ~/.npm
      ${{ github.workspace }}/.next/cache
    # Generate a new cache whenever packages or source files change.
    key: ${{ runner.os }}-nextjs-${{ hashFiles('**/package-lock.json') }}-${{ hashFiles('**/*.js', '**/*.jsx', '**/*.ts', '**/*.tsx') }}
    # If source files changed but packages didn't, rebuild from a prior cache.
    restore-keys: |
      ${{ runner.os }}-nextjs-${{ hashFiles('**/package-lock.json') }}-
```

The key structure (`<os>-nextjs-<lockfile-hash>-<source-hash>`) is deliberate: an exact match is identical inputs, a partial match (same lockfile, different sources) is "rebuild incrementally."

**If you use this**, drop the `cache: 'npm'` from `setup-node` — you're already caching `~/.npm` here, and having both is redundant (and the keys differ, so they'd thrash).

## 3. Playwright browsers — manual cache

Playwright downloads ~250MB of browser binaries to `~/.cache/ms-playwright`. The official Playwright CI guide installs them every run (`npx playwright install --with-deps`), which is correct (browser versions are pinned by `@playwright/test`) but slow.

To cache:

```yaml
- name: Cache Playwright browsers
  id: playwright-cache
  uses: actions/cache@v4
  with:
    path: ~/.cache/ms-playwright
    key: ${{ runner.os }}-playwright-${{ hashFiles('**/package-lock.json') }}

- name: Install Playwright browsers
  if: steps.playwright-cache.outputs.cache-hit != 'true'
  run: npx playwright install --with-deps

- name: Install Playwright system deps only
  if: steps.playwright-cache.outputs.cache-hit == 'true'
  run: npx playwright install-deps
```

The split-step pattern is important: browsers are cached, but system dependencies (apt packages) are runner-state and must be reinstalled every run.

## 4. `actions/cache@v4` — the generic shape

For everything else (Turbo build cache, Cypress, custom toolchains):

```yaml
- uses: actions/cache@v4
  with:
    path: <one path or list>
    key: ${{ runner.os }}-<name>-${{ hashFiles('<files that change the cache>') }}
    restore-keys: |
      ${{ runner.os }}-<name>-
```

Rules:
- **`path`** can be a single string or a multi-line list. Each path is restored.
- **`key`** must include `runner.os` — caches are not portable across OS.
- **`hashFiles()`** is the standard "what determines this cache" signal. Use the most specific set of files possible.
- **`restore-keys`** is optional but recommended. Order matters: most-specific first, least-specific last. Each is a prefix match against existing cache keys.

## 5. Cache invalidation — when to bust on purpose

Sometimes the cache is the bug. To force a miss without changing source:

- Bump the key with a version suffix: `${{ runner.os }}-nextjs-v2-${{ hashFiles(...) }}`. The `v2` is a knob you can turn manually.
- Or set a workflow input and weave it in:
  ```yaml
  on:
    workflow_dispatch:
      inputs:
        no_cache:
          type: boolean
          default: false
  # ... then in the cache step:
  key: ${{ runner.os }}-nextjs-${{ inputs.no_cache && github.run_id || hashFiles(...) }}
  ```

Don't reach for "delete the cache" in the UI as a routine fix — fix the key.

## 6. What NOT to cache

- **Secrets, tokens, credentials.** Anyone with read access to the repo can craft a PR that restores the cache. Caches are effectively public.
- **`node_modules`.** Cache `~/.npm` instead and let `npm ci` rebuild. The full `node_modules` directory is huge, hits the 10GB repo cache limit fast, and is fragile across npm version drift.
- **`.next` (the whole directory).** Cache `.next/cache` only — `.next/server`, `.next/static`, etc. are build outputs that should be regenerated.
- **Anything written by tests.** Test outputs go in artifacts, not caches.

## 7. Limits

- Total cache size per repo: **10 GB**. Older caches are evicted LRU.
- Cache entry lifetime: **7 days** since last access. Restore counts as access.
- Caches are scoped to the repo and the branch (with fallback to base branch for PRs).
- A cache restored on a PR from a fork is read-only — the post-step won't write back.

## 8. Verifying cache health

In a workflow run's log, every cache step prints whether it was a hit, partial hit, or miss. If you see consistent misses on what should be a hit, the key has too many `hashFiles()` axes or a dynamic value sneaking in. Strip axes until it stabilizes.

```yaml
- uses: actions/cache@v4
  id: cache
  with:
    path: ...
    key: ...

- run: echo "cache-hit=${{ steps.cache.outputs.cache-hit }}"
```

`cache-hit` is `'true'` only on exact key match. Partial matches via `restore-keys` show as `'false'`. Use that signal to conditionally skip an install step (see Playwright pattern above).
