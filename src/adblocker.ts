import type { Page } from 'playwright';
import { PlaywrightBlocker } from '@ghostery/adblocker-playwright';

let blocker: PlaywrightBlocker | null = null;
let initPromise: Promise<PlaywrightBlocker> | null = null;

/**
 * Initialize Ghostery adblocker eagerly or lazily.
 * Call this at server startup to pre-load filters before any search.
 */
export async function initAdblocker(): Promise<PlaywrightBlocker> {
  if (blocker) return blocker;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const start = Date.now();
    console.error('[Adblocker] Loading Ghostery prebuilt ads & tracking filters...');
    blocker = await PlaywrightBlocker.fromPrebuiltAdsAndTracking(fetch);
    console.error(`[Adblocker] Ghostery ready in ${Date.now() - start}ms — ads/trackers/malware blocked`);
    return blocker;
  })();

  return initPromise;
}

/**
 * Enable ad/tracker blocking on a Playwright page.
 * Must be called BEFORE page.goto() — blocking is applied to subsequent requests.
 */
export async function enableBlocking(page: Page): Promise<void> {
  const b = await initAdblocker();
  await b.enableBlockingInPage(page);
  console.error('[Adblocker] Blocking enabled on page');
}

/**
 * Disable blocking on a page (rarely needed).
 */
export async function disableBlocking(page: Page): Promise<void> {
  if (!blocker) return;
  await blocker.disableBlockingInPage(page);
}

/**
 * Check if adblocker has been initialized.
 */
export function isAdblockerReady(): boolean {
  return blocker !== null;
}

/**
 * Get blocker stats for debugging.
 */
export function getAdblockerStats(): { initialized: boolean; } {
  return { initialized: blocker !== null };
}