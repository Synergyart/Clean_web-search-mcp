#!/usr/bin/env node

/**
 * Test Google search independently via Playwright Chromium
 * Tests bot detection avoidance, consent handling, and result parsing
 */

import { chromium } from 'playwright';

async function testGoogle() {
  console.log('=== TESTING GOOGLE SEARCH ===');

  const browser = await chromium.launch({
    headless: false,
    args: [
      '--no-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  });

  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'en-US',
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });

  // Add stealth scripts
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en'],
    });
    const w = window;
    w.chrome = {
      runtime: {},
      loadTimes: function () {},
      csi: function () {},
      app: {},
    };
    const origQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = params =>
      params.name === 'notifications'
        ? Promise.resolve({ state: 'prompt' })
        : origQuery(params);
  });

  const page = await context.newPage();

  try {
    const query = 'javascript tutorial';
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=5&hl=en`;
    console.log(`Navigating to: ${searchUrl}`);

    const startTime = Date.now();
    await page.goto(searchUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });
    const loadTime = Date.now() - startTime;

    // Check for consent page redirect
    const currentUrl = page.url();
    console.log(`Current URL: ${currentUrl}`);

    if (currentUrl.includes('consent.google')) {
      console.log('Detected consent page, attempting to accept...');
      const consentButtons = [
        'button[aria-label="Accept all"]',
        'button:has-text("Accept all")',
        'button:has-text("I agree")',
        '#L2AGLb',
        'form[action*="consent"] button',
      ];
      for (const selector of consentButtons) {
        try {
          const btn = await page.$(selector);
          if (btn) {
            await btn.click();
            console.log(`Clicked consent button: ${selector}`);
            await page.waitForTimeout(1000);
            break;
          }
        } catch {
          /* try next */
        }
      }
      // Re-navigate after consent
      await page.goto(searchUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 10000,
      });
    }

    const html = await page.content();
    console.log(`✓ Page loaded successfully in ${loadTime}ms`);
    console.log(`✓ HTML length: ${html.length} characters`);
    console.log(`✓ Final URL: ${page.url()}`);

    // Check for bot detection
    const title = await page.title();
    console.log(`✓ Page title: ${title}`);

    if (
      title.includes('unusual traffic') ||
      title.includes('sorry') ||
      html.includes('automated requests')
    ) {
      console.log('❌ Bot detection detected - unusual traffic page');
      if (html.length < 2000)
        console.log('Page content:', html.substring(0, 2000));
      return false;
    }

    if (html.includes('recaptcha') || html.includes('captcha')) {
      console.log('❌ CAPTCHA challenge detected');
      return false;
    }

    if (html.length < 5000) {
      console.log(
        `⚠️ HTML suspiciously short (${html.length} chars), possible bot detection`
      );
    }

    // Try multiple selectors for Google results
    const resultSelectors = [
      'div.g', // Classic Google result
      'div.MjjYud', // New Google result (2024+)
      'div[data-sokoban-container]', // Alternative container
      '#search div.g', // Scoped to search area
      'div.tF2Cxc', // Another format
    ];

    let resultElements = [];
    let workingSelector = '';

    for (const selector of resultSelectors) {
      try {
        resultElements = await page.$$(selector);
        console.log(
          `  Selector "${selector}": ${resultElements.length} elements`
        );
        if (resultElements.length >= 3) {
          workingSelector = selector;
          break;
        }
      } catch {
        /* try next */
      }
    }

    // If no good selector, try to find any h3-containing divs
    if (resultElements.length < 3) {
      console.log('Trying fallback: looking for h3 elements...');
      const h3Elements = await page.$$('h3');
      console.log(`Found ${h3Elements.length} h3 elements`);
      // Use h3 elements directly
      resultElements = h3Elements;
      workingSelector = 'h3 (fallback)';
    }

    if (resultElements.length > 0) {
      console.log(
        `✓ Working selector: "${workingSelector}" with ${resultElements.length} results`
      );
      console.log('\n--- SAMPLE RESULTS ---');

      for (let i = 0; i < Math.min(5, resultElements.length); i++) {
        const el = resultElements[i];

        // Try to get title from various selectors
        const titleSelectors = ['h3', '.LC20lb', '.DKV0Md'];
        let title = 'No title';
        let url = 'No URL';

        for (const titleSel of titleSelectors) {
          try {
            const titleEl =
              workingSelector === 'h3 (fallback)' ? el : await el.$(titleSel);
            if (titleEl) {
              title = (await titleEl.textContent()) || 'No title';
              title = title.trim();
              // Find parent link
              const linkEl =
                workingSelector === 'h3 (fallback)'
                  ? await el.evaluateHandle(node => node.closest('a'))
                  : (await el.$('a')) ||
                    (await el.evaluateHandle(node => node.querySelector('a')));
              if (linkEl && linkEl.asElement) {
                const linkElement = linkEl.asElement();
                if (linkElement) {
                  url = (await linkElement.getAttribute('href')) || 'No URL';
                }
              }
              if (url === 'No URL' && workingSelector !== 'h3 (fallback)') {
                // Try any link in element
                const anyLink = await el.$('a[href]');
                if (anyLink) {
                  url = (await anyLink.getAttribute('href')) || 'No URL';
                }
              }
              if (title && title !== 'No title') break;
            }
          } catch {
            /* try next */
          }
        }

        // Try to get snippet
        const snippetSelectors = [
          '.VwiC3b',
          '.st',
          '.aCOpRe',
          'span.aCOpRe',
          '.lEBKkf',
        ];
        let snippet = 'No snippet';

        if (workingSelector !== 'h3 (fallback)') {
          for (const snippetSel of snippetSelectors) {
            try {
              const snippetEl = await el.$(snippetSel);
              if (snippetEl) {
                snippet = (await snippetEl.textContent()) || 'No snippet';
                snippet = snippet.trim();
                if (snippet && snippet.length > 10) break;
              }
            } catch {
              /* try next */
            }
          }
        }

        console.log(`${i + 1}. ${title}`);
        console.log(`   URL: ${url}`);
        console.log(`   Snippet: ${snippet.substring(0, 120)}...`);
        console.log('');
      }

      console.log('✅ GOOGLE SEARCH: SUCCESS');
      return true;
    } else {
      console.log('❌ No results found');
      console.log('Sample HTML (first 2000 chars):');
      console.log(html.substring(0, 2000));
      return false;
    }
  } catch (error) {
    console.log(`❌ GOOGLE SEARCH FAILED: ${error.message}`);
    if (error.stack) {
      console.log(
        'Stack trace (first 500 chars):',
        error.stack.substring(0, 500)
      );
    }
    return false;
  } finally {
    await browser.close();
  }
}

testGoogle().then(success => {
  console.log(`\nGOOGLE RESULT: ${success ? 'WORKING ✅' : 'FAILED ❌'}`);
  process.exit(success ? 0 : 1);
});
