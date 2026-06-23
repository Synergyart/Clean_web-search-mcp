# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- **StartPage search engine** as primary search provider (replaces Google in active chain):
  - Added `tryStartPageSearch()` — axios-based, no browser needed, ~500-1150ms response time
  - Added `parseStartPageResults()` — parses `.result` elements with `.result-title.result-link` and `.description`; strips inline `<style>` tags to prevent CSS leakage
  - StartPage proxies Google search results without the IP-level blocking that prevents datacenter Google access
  - Current engine fallback chain: StartPage → Bing → Brave → DuckDuckGo
- **Playwright Firefox browser** installed alongside Chromium
- **1-click install script** (`install.sh`):
  - Installs pnpm, dependencies via `pnpm install --frozen-lockfile`, Playwright Chromium, and builds TypeScript
  - Added **Quick Install** section to README with `curl | bash` one-liner
- **New test scripts**: `test-startpage.js`, `test-google.js`, `test-google-experimental.js`, `test-release-build.js`, `inspect-startpage.js`, `inspect-startpage2.js`
- **Documentation**: `CHANGELOG.md` and `docs/POSTMORTEM-2026-06-08.md` (Chromium unification + adblocker integration postmortem)

### Fixed

- **Stdout protocol corruption — searches failed completely on LM Studio and all MCP clients:**
  - 171 `console.log()` calls across 6 files wrote debug text to stdout, interleaving with JSON-RPC frames
  - MCP protocol requires stdout to contain only newline-delimited JSON messages; any stray text causes parse failures
  - Replaced all `console.log(` → `console.error(` so debug output goes to stderr (MCP standard logging channel)
  - Affected files: `index.ts`, `search-engine.ts`, `enhanced-content-extractor.ts`, `content-extractor.ts`, `browser-pool.ts`, `adblocker.ts`
- **Search engine loop discarded valid results when trailing engines returned empty:**
  - Bing found 10 results (quality 0.77) but Brave/DuckDuckGo returned 0; loop fell through to empty-results return
  - Bing was explicitly excluded from the "acceptable quality → return" path (`approach.name !== 'Browser Bing'`)
  - Fixed: all engines treated equally; best results returned after loop even if trailing engines produced nothing
- **Brave search parser broken after Brave HTML structure change:**
  - Snippet extraction used outdated selectors (`.generic-snippet .content`, `.snippet-content`) that no longer match
  - Brave 2024+ now uses `.content div[class*="line-clamp"]` for snippet text; added as primary selector, legacy selectors kept as fallback
  - Added `.video-snippet .content` to snippet fallback chain for Brave video-result layout
  - Fixed `test-brave.js` Playwright selectors (`h2 a` → `a[href^="http"]`, `.title a` → `.search-snippet-title`) to match Brave 2024+ DOM
  - Added stealth scripts (hide `navigator.webdriver`, mock plugins/languages) and `--disable-blink-features=AutomationControlled` args
- **TypeScript build error TS2589** with `@modelcontextprotocol/sdk` v1.29.0:
  - Deeply transformed zod schemas (union → transform → default → optional chains) caused TypeScript's type instantiation depth to be exceeded
  - Resolved by passing explicit `<any>` generic to `this.server.tool<any>()` on all three tool registrations
- **ESLint errors**: removed unused `debugBing` variable in `parseBingResults`; fixed `PermissionStatus` type assertion in stealth script

### Changed

- **README updated** to reflect current architecture:
  - Engine order: StartPage → Bing → Brave → DuckDuckGo (was Bing → Brave → DuckDuckGo)
  - Brave browser: Chromium (was Firefox)
  - Package manager: pnpm (was npm)
  - Added Ghostery adblocker and Quick Install section

### Security

- **Ghostery adblocker (`@ghostery/adblocker-playwright`) integrated across all headless browsers:**
  - `src/adblocker.ts`: uses `PlaywrightBlocker.fromPrebuiltAdsAndTracking(fetch)` to load Ghostery filters; exposes `enableBlocking(page)` / `disableBlocking(page)` / `isAdblockerReady()` / `getAdblockerStats()`
  - `src/enhanced-content-extractor.ts`: `enableBlocking(page)` called before every `page.goto()` in browser extraction (both normal and HTTP/1.1 fallback paths)
  - `src/search-engine.ts`: `enableBlocking(page)` called before Brave, Bing, and Google searches — blocks ads/trackers/malware on search result pages
  - `src/index.ts`: `initAdblocker()` eagerly loaded at server startup so filters are ready before any page load (race-condition-free)
  - Prevents malvertising-based malware downloads by blocking ad/tracker requests at the network level before they reach the page
- **Migrated from npm to pnpm** to mitigate supply chain attack risks:
  - Removed `package-lock.json` and `node_modules/`
  - Added `pnpm-lock.yaml` (lockfile)
  - Added `"packageManager": "pnpm@11.5.1"` to `package.json`
  - Created `pnpm-workspace.yaml` with hardened security defaults:
    - `minimumReleaseAge: 4320` — 3-day cooldown on newly published packages
    - `trustPolicy: no-downgrade` — reject packages with regressed publishing trust
    - `strictDepBuilds: true` — fail on unauthorized lifecycle scripts
    - `blockExoticSubdeps: true` — block transitive dependencies from git/tarball URLs
    - `allowBuilds` — only `esbuild` and `playwright` permitted to run postinstall scripts
  - Updated `.gitignore` with `pnpm-lock.yaml` and `.pnpm-store/`

### Test Results (2026-06-23)

| Test                  | Status | Notes                                                              |
| --------------------- | ------ | ------------------------------------------------------------------ |
| `test-startpage.js`   | ✅     | 10/10 valid results, axios-based, ~1290ms                          |
| `test-bing.js`        | ✅     | 10/10 valid results, Chromium headless, ~1303ms                    |
| `test-brave.js`       | ✅     | 5/5 valid results with titles/URLs/snippets; 20 `[data-type="web"]` elements found |
| `test-duckduckgo.js`  | ❌     | Bot detection on both main DDG and HTML endpoints                  |
| `test-all-engines.js` | ✅     | 3/3 comprehensive tests passed, all queries resolved via StartPage (544-1125ms) |
| `test-search.js`      | ✅     | Search pipeline functional, StartPage resolves first attempt       |

## [v0.3.1] - Upstream

Initial upstream release from [mrkrsl/web-search-mcp](https://github.com/mrkrsl/web-search-mcp).
