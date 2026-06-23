#!/usr/bin/env node

/**
 * Experimental Google search tests trying different evasion strategies
 * Goal: find which approach (if any) bypasses Google's bot detection
 */

import { chromium } from 'playwright';

async function tryStrategy(name, config) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`STRATEGY: ${name}`);
  console.log(`${'='.repeat(60)}`);

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        ...(config.browserArgs || []),
      ],
    });

    const context = await browser.newContext({
      userAgent:
        config.userAgent ||
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      viewport: config.viewport || { width: 1920, height: 1080 },
      locale: config.locale || 'en-US',
      ...(config.contextOptions || {}),
    });

    // Stealth scripts
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });
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

    // Step 1: Visit google.com/ncr first (if configured)
    if (config.visitHomepage) {
      console.log('  Step 1: Visiting google.com/ncr...');
      await page.goto('https://www.google.com/ncr', {
        waitUntil: 'domcontentloaded',
        timeout: 10000,
      });
      await page.waitForTimeout(config.homepageDelay || 1000);
      console.log(`  Homepage URL: ${page.url()}`);

      // Handle consent if redirected
      if (page.url().includes('consent.google')) {
        console.log('  Consent page detected, trying to accept...');
        try {
          const btn = await page.$('#L2AGLb');
          if (btn) {
            await btn.click();
            await page.waitForTimeout(1000);
          }
        } catch {}
      }
    }

    // Step 2: Navigate to search
    const query = config.query || 'javascript tutorial';
    const searchUrl =
      config.searchUrl ||
      `https://www.google.com/search?q=${encodeURIComponent(query)}&num=5&hl=en`;

    console.log(`  Step 2: Navigating to search: ${searchUrl}`);
    const startTime = Date.now();
    await page.goto(searchUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });
    const loadTime = Date.now() - startTime;

    // Step 3: Analyze response
    const finalUrl = page.url();
    const title = await page.title();
    let html = '';
    try {
      html = await page.content();
    } catch {}

    console.log(`  Load time: ${loadTime}ms`);
    console.log(`  Final URL: ${finalUrl}`);
    console.log(`  Title: ${title}`);
    console.log(`  HTML length: ${html.length}`);

    // Check for blocking
    if (finalUrl.includes('/sorry/')) {
      console.log(`  RESULT: ❌ BLOCKED (redirected to sorry page)`);
      return { success: false, reason: 'sorry_redirect' };
    }
    if (
      html.includes('unusual traffic') ||
      html.includes('automated requests')
    ) {
      console.log(`  RESULT: ❌ BLOCKED (unusual traffic page)`);
      return { success: false, reason: 'unusual_traffic' };
    }
    if (html.includes('recaptcha') || html.includes('captcha')) {
      console.log(`  RESULT: ❌ BLOCKED (CAPTCHA challenge)`);
      return { success: false, reason: 'captcha' };
    }
    if (html.length < 5000) {
      console.log(`  RESULT: ⚠️ SUSPICIOUS (very short HTML)`);
      return { success: false, reason: 'short_html', html };
    }

    // Check for actual search results
    const hasResults =
      html.includes('div class="g"') ||
      html.includes('class="g"') ||
      html.includes('<h3') ||
      html.includes('LC20lb');

    if (hasResults) {
      console.log(`  RESULT: ✅ WORKING! Search results detected`);
      return { success: true, reason: 'results_found', html };
    }

    console.log(
      `  RESULT: ⚠️ No results detected (HTML length ${html.length}, may need parser inspection)`
    );
    return { success: false, reason: 'no_results', html };
  } catch (error) {
    console.log(`  RESULT: ❌ ERROR: ${error.message}`);
    return { success: false, reason: 'error', error: error.message };
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {}
    }
  }
}

async function runAllStrategies() {
  console.log('GOOGLE SEARCH EVASION STRATEGY TEST');
  console.log('Testing multiple approaches to bypass Google bot detection\n');

  const strategies = [
    {
      name: 'A: Direct URL (baseline)',
      config: {
        searchUrl:
          'https://www.google.com/search?q=javascript+tutorial&num=5&hl=en',
      },
    },
    {
      name: 'B: Visit NCR first + delay',
      config: {
        visitHomepage: true,
        homepageDelay: 2000,
        searchUrl:
          'https://www.google.com/search?q=javascript+tutorial&num=5&hl=en',
      },
    },
    {
      name: 'C: Mobile emulation (iPhone)',
      config: {
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        viewport: { width: 390, height: 844 },
        searchUrl:
          'https://www.google.com/search?q=javascript+tutorial&num=5&hl=en',
      },
    },
    {
      name: 'D: gbv=1 (old JSON-less output)',
      config: {
        searchUrl:
          'https://www.google.com/search?q=javascript+tutorial&num=5&gbv=1&hl=en',
      },
    },
    {
      name: 'E: UK locale + NCR',
      config: {
        locale: 'en-GB',
        visitHomepage: true,
        searchUrl:
          'https://www.google.com/search?q=javascript+tutorial&num=5&hl=en&gl=uk',
      },
    },
    {
      name: 'F: Non-English query + delay',
      config: {
        visitHomepage: true,
        homepageDelay: 3000,
        query: 'python programmierung tutorial',
        searchUrl:
          'https://www.google.com/search?q=python+programmierung+tutorial&num=5&hl=de',
      },
    },
    {
      name: 'G: Lite mode (web light)',
      config: {
        searchUrl:
          'https://www.google.com/search?q=javascript+tutorial&num=5&lite=1&hl=en',
      },
    },
    {
      name: 'H: Complete=0 param',
      config: {
        searchUrl:
          'https://www.google.com/search?q=javascript+tutorial&num=5&complete=0&hl=en',
      },
    },
  ];

  const results = [];
  for (const s of strategies) {
    const result = await tryStrategy(s.name, s.config);
    results.push({ strategy: s.name, ...result });
    // Pause between attempts to avoid rate limiting
    if (strategies.indexOf(s) < strategies.length - 1) {
      console.log('\n  Waiting 3 seconds before next strategy...');
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  // Summary
  console.log(`\n\n${'='.repeat(60)}`);
  console.log('SUMMARY');
  console.log(`${'='.repeat(60)}`);

  let workingFound = false;
  for (const r of results) {
    const icon = r.success ? '✅' : '❌';
    console.log(`${icon} ${r.strategy}: ${r.reason}`);
    if (r.success) workingFound = true;
  }

  if (workingFound) {
    console.log('\n🎉 At least one strategy works!');
    process.exit(0);
  } else {
    console.log(
      '\n❌ All strategies failed. Google is aggressively blocking this IP/environment.'
    );
    process.exit(1);
  }
}

runAllStrategies().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
