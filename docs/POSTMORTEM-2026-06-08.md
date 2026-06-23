# Postmortem: Chromium Unification + Adblocker Integration

**Date:** 2026-06-08
**Project:** `web-search-mcp-server` (MCP server for web search)
**Repo:** `/home/cc/Documentos/web-full`

---

## Summary

3 tasks completed across 6 files:

1. Switched Brave search from Firefox → Chromium (1 file)
2. Fixed Brave HTML result parsing for Brave's 2024+ DOM (1 file)
3. Integrated `@ghostery/adblocker-playwright` for ad/tracker blocking (4 files)

Zero architecture changes. All existing APIs preserved.

---

## Step 0: Understand the Project

```
## Files to read first:
- package.json          → project identity, dependencies (playwright, cheerio, axios)
- src/browser-pool.ts   → how browsers are launched and pooled
- src/search-engine.ts  → how searches are executed (StartPage, Bing, Brave, DuckDuckGo)
- src/enhanced-content-extractor.ts → how page content is fetched via browser
- src/index.ts          → MCP server entry point, browser lifecycle
```

### Key Architecture Facts

| Fact                    | Detail                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------ |
| Search engines          | StartPage (axios), Bing (Chromium browser), Brave (Firefox browser), DuckDuckGo (axios)    |
| Browser launch          | Dedicated `chromium.launch()` per search engine, NOT using BrowserPool                     |
| BrowserPool             | Used only by EnhancedContentExtractor for page content extraction                          |
| Default browsers        | `BROWSER_TYPES=chromium,firefox` — pool rotates between types                              |
| Existing route blocking | EnhancedContentExtractor had crude `page.route()` blocking images/fonts/media              |
| Headless mode           | Default `true`, controlled by `BROWSER_HEADLESS` env var                                   |
| Google search method    | `tryBrowserGoogleSearch` (lines 299-547) — defined but NOT in approaches array. Dead code. |

### How to Discover This

```bash
# Find all browser launch sites
grep -n "launch\|firefox\|chromium\|webkit" src/*.ts

# Find the search approach chain
grep -n "approaches\|tryBrowser\|tryStartPage\|tryDuckDuckGo" src/search-engine.ts

# Check which browsers are installed
pnpm playwright --version
ls ~/.cache/ms-playwright/
```

---

## Task 1: Switch Brave Search from Firefox to Chromium

### Rationale

User wanted Chromium as sole browser. Brave search was only Firefox holdout.
Bing already used Chromium. Google method dead code.
BrowserPool defaulted to chromium+firefox rotation (later task).

### Changes: `src/search-engine.ts`

**Location:** `tryBrowserBraveSearch` method, ~line 189

```
BEFORE:
  const { firefox } = await import('playwright');
  browser = await firefox.launch({
    headless: process.env.BROWSER_HEADLESS !== 'false',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

AFTER:
  const { chromium } = await import('playwright');
  browser = await chromium.launch({
    headless: process.env.BROWSER_HEADLESS !== 'false',
    args: [
      '--no-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  });
```

**Why the arg changes:**

- `--disable-blink-features=AutomationControlled`: hides `navigator.webdriver` flag
- `--disable-gpu`: avoids GPU crashes in headless Linux
- Matches what Bing search already uses at line 885

### Verification

```bash
pnpm build  # must compile clean
node tests/test-brave.js  # standalone Brave test — page loads, results found
```

---

## Task 2: Fix Brave HTML Result Parsing

### Problem

Brave redesigned their search result HTML. Old cheerio selectors (`.title a`, `h2 a`, `.snippet-content`) returned zero matches regardless of browser.

### Discovery Method

```bash
# Launch Chromium, navigate to Brave, dump result DOM
node -e "
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--no-sandbox','--disable-gpu'] });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 768 },
    locale: 'en-US',
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'plugins', { get: () => [1,2,3,4,5]});
  });
  const page = await context.newPage();
  await page.goto('https://search.brave.com/search?q=python+asyncio&source=web', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(2000);
  // Dump first result element HTML
  const html = await page.evaluate(() => {
    const el = document.querySelector('[data-type=\"web\"]');
    return el ? el.outerHTML : 'no element';
  });
  console.log(html);
  await browser.close();
})();
"
```

This produces the full HTML of one result element. Analyze it to find the selectors.

### Brave 2024+ DOM Structure

```
div.snippet[data-type="web"][data-pos="N"]     ← result container (still works!)
  div.result-wrapper
    div.result-content
      a[href]                                   ← URL (href attribute)
        div.site-name-wrapper                   ← skip (site icon + breadcrumb)
        div.title.search-snippet-title           ← TITLE (text + title attr)
      div.generic-snippet                        ← SNIPPET container
        div.content                              ← snippet text
```

### New Selectors

| Purpose          | Old (broken)            | New (working)                                   |
| ---------------- | ----------------------- | ----------------------------------------------- |
| Result container | `[data-type="web"]`     | `[data-type="web"]` (unchanged)                 |
| URL              | `.title a`, `h2 a`      | `a[href^="http"]` (first external link)         |
| Title            | `.title a` text         | `div.search-snippet-title` (text or title attr) |
| Snippet          | `.snippet-content`, `p` | `.generic-snippet .content`                     |

### Changes: `src/search-engine.ts` — `parseBraveResults`

**Key implementation details:**

1. Find result elements: `$('[data-type="web"]')` — unchanged
2. Extract URL: `$element.find('a[href^="http"]').first().attr('href')`
3. Extract title: `$link.find('.search-snippet-title, div[class*="title"]').first()` — prefer `title` attribute over text (it has full un-truncated text)
4. Fallback title: split link text by double spaces, take last segment
5. Extract snippet: try `.generic-snippet .content`, `.snippet-content`, `.generic-snippet`, `.description` in order

**Critical: validate URL before adding.** Use `this.isValidSearchUrl(url)` to skip internal links, ads, and non-HTTP URLs.

### Verification

```bash
pnpm build
# Run full multi-engine search to hit Brave path:
FORCE_MULTI_ENGINE_SEARCH=true node --input-type=module -e "
import { SearchEngine } from './dist/search-engine.js';
const engine = new SearchEngine();
const result = await engine.search({ query: 'python asyncio', numResults: 5, timeout: 15000 });
console.log('Engine:', result.engine);
result.results.forEach((r,i) => console.log((i+1)+'.', r.title));
"
```

Expected: All 5 results have valid titles, URLs, and snippets.

---

## Task 3: Research Adblocker Options

### Constraint Discovery

User asked for uBlock Origin Lite. Research revealed two paths:

**Path A: `@ghostery/adblocker-playwright` (route interception)**

- Works with `chromium.launch()` + `browser.newContext()` — NO architecture change
- Uses `page.route()` to match requests against EasyList/EasyPrivacy filters
- API: `blocker.enableBlockingInPage(page)`
- Also injects CSS for cosmetic filtering, removes blocked iframes
- npm: `@ghostery/adblocker-playwright` v2.18.0 (maintained)

**Path B: uBlock Origin Lite (native extension)**

- Requires `chromium.launchPersistentContext()` — replaces Browser + ephemeral context model
- Needs `--disable-extensions-except=path` + `--load-extension=path` args
- Must use `channel: 'chromium'` for headless mode
- Each persistent context needs unique `userDataDir`
- Extension source must be downloaded from GitHub releases, extracted
- MV3 extension — uses declarativeNetRequest, works in headless

### Decision: Path A (ghostery)

**Why:**

- Path B would require rewriting BrowserPool from `Browser` + `newContext()` to persistent contexts
- 5x more code, fundamental architecture change
- Persistent contexts don't support ephemeral context isolation (no `browser.newContext()`)
- Ghostery approach: 3 lines per integration point, zero architecture risk
- Same filter lists (EasyList, EasyPrivacy) as uBlock Origin
- Adds cosmetic filtering + iframe removal (same as what uBO Lite does)

### How to Research This Yourself

```bash
# Check Playwright docs on extensions
# URL: https://playwright.dev/docs/chrome-extensions
# Key fact: "Extensions only work in Chromium when launched with a persistent context."

# Find npm package
npm search adblocker playwright

# Inspect API
node -e "import('@ghostery/adblocker-playwright').then(m => console.log(Object.keys(m)))"

# Check factory methods
node -e "import('@ghostery/adblocker-playwright').then(m => console.log(Object.getOwnPropertyNames(m.FiltersEngine)))"
# Output includes: fromPrebuiltAdsAndTracking, fromPrebuiltAdsOnly, fromPrebuiltFull, fromLists

# Test creation
node -e "
import('@ghostery/adblocker-playwright').then(async (m) => {
  const blocker = await m.PlaywrightBlocker.fromPrebuiltAdsAndTracking(fetch);
  console.log('Type:', blocker.constructor.name);
  console.log('Has enableBlockingInPage:', typeof blocker.enableBlockingInPage);
});
"
```

### Key API: `PlaywrightBlocker`

```typescript
// Factory (inherited from FiltersEngine):
static fromPrebuiltAdsAndTracking(fetch: typeof fetch): Promise<PlaywrightBlocker>
static fromPrebuiltAdsOnly(fetch: typeof fetch): Promise<PlaywrightBlocker>
static fromPrebuiltFull(fetch: typeof fetch): Promise<PlaywrightBlocker>
static fromLists(fetch: typeof fetch, urls: string[]): Promise<PlaywrightBlocker>

// Instance methods:
enableBlockingInPage(page: Page): Promise<BlockingContext>  // sets up page.route() + CSS injection + iframe removal
disableBlockingInPage(page: Page): Promise<void>
isBlockingEnabled(page: Page): boolean
```

---

## Task 4: Integrate Adblocker

### Step 4a: Install

```bash
pnpm add @ghostery/adblocker-playwright
# Installs v2.18.0 with ~13 transitive dependencies
```

### Step 4b: Create Singleton — `src/adblocker.ts`

**Why a singleton:**

- `fromPrebuiltAdsAndTracking(fetch)` downloads filter lists (~1.4s on first call)
- Multiple browser instances share the same filter engine (thread-safe, stateless matching)
- Lazy init: first `enableBlocking(page)` call triggers download, subsequent calls hit cache

**Singleton pattern:**

```typescript
let blocker: PlaywrightBlocker | null = null;
let initPromise: Promise<PlaywrightBlocker> | null = null;

export async function initAdblocker(): Promise<PlaywrightBlocker> {
  if (blocker) return blocker;
  if (initPromise) return initPromise; // prevent race: multiple concurrent calls share promise
  initPromise = PlaywrightBlocker.fromPrebuiltAdsAndTracking(fetch);
  blocker = await initPromise;
  return blocker;
}

export async function enableBlocking(page: Page): Promise<void> {
  const b = await initAdblocker();
  await b.enableBlockingInPage(page);
}
```

### Step 4c: Integration — `enhanced-content-extractor.ts`

**Critical: route handler conflict.**

`enableBlockingInPage(page)` calls `page.route('**/*', ...)` internally. The existing code also called `page.route('**/*', ...)` to block images/fonts/media. Only one `page.route()` handler can be active per pattern — the last one wins.

**Solution:** Remove the existing route handlers, replace with `enableBlocking(page)`. The adblocker's EasyList filters cover:

- Ad network domains (doubleclick, adsystem, etc.)
- Tracking/analytics scripts
- Ad images and tracking pixels (filter rules match image URLs too)
- Cosmetic hiding of ad containers

**Locations changed (3 route handlers removed):**

1. Main extraction path (~line 154): `page.route('**/*', ...)` → `await enableBlocking(page)`
2. HTTP/1.1 fallback path (~line 197): `http1Page.route('**/*', ...)` → `await enableBlocking(http1Page)`
3. Import added: `import { enableBlocking } from './adblocker.js';`

### Step 4d: Integration — `search-engine.ts`

**Locations (3 page creations, each gets `enableBlocking`):**

| Method                           | Line  | Search Engine      | Browser  |
| -------------------------------- | ----- | ------------------ | -------- |
| `tryBrowserBraveSearchInternal`  | ~260  | Brave              | Chromium |
| `tryBrowserGoogleSearchInternal` | ~476  | Google (dead code) | Chromium |
| `tryBrowserBingSearchInternal`   | ~1003 | Bing               | Chromium |

**Pattern (identical at all 3 sites):**

```typescript
const page = await context.newPage();

// Enable adblocker on search page
await enableBlocking(page);

// Navigate to search URL
await page.goto(searchUrl, ...);
```

### Verification

```bash
pnpm build
FORCE_MULTI_ENGINE_SEARCH=true node --input-type=module -e "
import { SearchEngine } from './dist/search-engine.js';
const engine = new SearchEngine();
const result = await engine.search({ query: 'nodejs tutorial', numResults: 5, timeout: 15000 });
console.log('Engine:', result.engine);
console.log('Results:', result.results.length);
result.results.forEach((r,i) => console.log((i+1)+'.', r.title));
"
```

Expected logs:

```
[Adblocker] Loading prebuilt ads & tracking filters...   ← first call, lazy init
[Adblocker] Ready in 1078ms                               ← filter lists downloaded
[Adblocker] Blocking enabled on page                      ← applied on Bing page
[Adblocker] Blocking enabled on page                      ← applied on Brave page
```

Expected performance: Bing homepage load ~765ms (down from ~1784ms without adblocker).

---

## Complete File Change Summary

| File                                | Action                                        | Lines |
| ----------------------------------- | --------------------------------------------- | ----- |
| `package.json`                      | Added `@ghostery/adblocker-playwright` dep    | 1     |
| `src/adblocker.ts`                  | **NEW** — lazy singleton                      | 27    |
| `src/search-engine.ts`              | Brave: firefox → chromium (lines 189-198)     | 4     |
| `src/search-engine.ts`              | Brave parser: new selectors (lines 1570-1645) | ~30   |
| `src/search-engine.ts`              | Import adblocker + enableBlocking on 3 pages  | 6     |
| `src/enhanced-content-extractor.ts` | Import adblocker, replace 2 route handlers    | 5     |

Total: ~73 lines changed/added across 6 files.

---

## Pitfalls and How to Avoid

### Pitfall 1: Brave page route handler overrides

`enableBlockingInPage` sets up `page.route('**/*', ...)`. Any subsequent `page.route('**/*', ...)` will replace it. Always call `enableBlocking` AFTER all other route setup is done and BEFORE navigation.

**How to detect:** If page loads but adblocker logs don't appear, or blocked request count is zero, the route handler was likely overridden.

### Pitfall 2: Brave CAPTCHA on rapid queries

Brave rate-limits aggressively. Second query from same IP within seconds triggers "Verifying you're not a bot." Use stealth scripts (`navigator.webdriver = undefined`, mock plugins, mock languages) and rotate user agents.

**How to detect:** Page title contains "Verifying you're not a bot" or HTML < 10KB.

### Pitfall 3: Svelte class names are unstable

Brave uses Svelte — class names like `svelte-14r20fy` are build hashes and may change between deploys. Never match on Svelte-generated classes. Use semantic selectors: `[data-type="web"]`, `.search-snippet-title`, `.generic-snippet .content`.

**How to detect:** Selector returns 0 elements but page loads fine. Re-dump result HTML to find new class names.

### Pitfall 4: Ghostery factory requires `fetch` parameter

`PlaywrightBlocker.fromPrebuiltAdsAndTracking(fetch)` needs the global `fetch` function passed explicitly. This is because the library can work in environments without global fetch.

**How to detect:** TypeError about fetch being undefined.

### Pitfall 5: Dead code assumptions

`tryBrowserGoogleSearch` exists in the codebase but is NOT in the approaches array. Don't assume a method is used just because it exists. Always grep for call sites.

```bash
grep -n "tryBrowserGoogleSearch(" src/search-engine.ts
# Shows: definition + internal call — but no external call site
```

---

## Environment

| Variable   | Value                                                    |
| ---------- | -------------------------------------------------------- |
| OS         | CachyOS x86_64 (Arch-based)                              |
| Node       | (from Playwright cache)                                  |
| pnpm       | 11.5.1                                                   |
| Playwright | 1.60.0 (npm), cached browsers at ~/.cache/ms-playwright/ |
| Shell      | fish 4.7.1                                               |
| Build      | `tsc && ...` → dist/index.js                             |
