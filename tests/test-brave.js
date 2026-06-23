#!/usr/bin/env node

// Test Brave search independently with Brave 2024+ DOM selectors
import { chromium } from 'playwright';

async function testBrave() {
  console.log('=== TESTING BRAVE SEARCH ===');

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  });
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 768 },
    locale: 'en-US',
  });

  const page = await context.newPage();

  try {
    // Stealth: hide automation flags
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    });

    const query = 'javascript tutorial';
    const searchUrl = `https://search.brave.com/search?q=${encodeURIComponent(query)}&source=web`;
    console.log(`Navigating to: ${searchUrl}`);

    const startTime = Date.now();
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
    const loadTime = Date.now() - startTime;

    await page.waitForTimeout(2000);

    const html = await page.content();
    console.log(`✓ Page loaded successfully in ${loadTime}ms`);
    console.log(`✓ HTML length: ${html.length} characters`);

    const title = await page.title();
    console.log(`✓ Page title: ${title}`);

    if (
      title.includes('Access Denied') ||
      title.includes('Captcha') ||
      html.includes('unusual traffic') ||
      html.includes('blocked') ||
      html.length < 1000
    ) {
      console.log('❌ Bot detection detected');
      console.log('Sample HTML:', html.substring(0, 500));
      return false;
    }

    // Brave 2024+ result container
    const resultElements = await page.$$('[data-type="web"]');
    console.log(`✓ Found ${resultElements.length} elements with selector: [data-type="web"]`);

    if (resultElements.length > 0) {
      console.log('\n--- SAMPLE RESULTS ---');

      let validCount = 0;
      for (let i = 0; i < Math.min(5, resultElements.length); i++) {
        let title = 'No title';
        let url = 'No URL';
        let snippet = 'No snippet';

        // URL: first HTTP link inside the result element
        const linkElement = await resultElements[i].$('a[href^="http"]');
        if (linkElement) {
          url = (await linkElement.getAttribute('href')) || 'No URL';

          // Title: Brave 2024+ uses .search-snippet-title inside the link
          const titleElement = await linkElement.$(
            '.search-snippet-title, div[class*="title"]'
          );
          if (titleElement) {
            const titleAttr = await titleElement.getAttribute('title');
            const textContent = await titleElement.textContent();
            title =
              titleAttr && titleAttr.length >= (textContent || '').length
                ? titleAttr.trim()
                : (textContent || 'No title').trim();
          } else {
            // Fallback: extract from link text
            const linkText = (await linkElement.textContent()) || '';
            const parts = linkText.split(/ {2,}/);
            const candidate = parts[parts.length - 1]?.trim();
            if (candidate && candidate.length > 3) {
              title = candidate;
            }
          }
        }

        // Snippet: Brave 2024+ snippet selectors
        const snippetSelectors = [
          '.generic-snippet .content',
          '.content div[class*="line-clamp"]',
          '.snippet-content',
          '.generic-snippet',
          '.description',
        ];
        for (const sel of snippetSelectors) {
          const snippetElement = await resultElements[i].$(sel);
          if (snippetElement) {
            snippet = ((await snippetElement.textContent()) || '').trim();
            break;
          }
        }

        console.log(`${i + 1}. ${title.substring(0, 80)}`);
        console.log(`   URL: ${url.substring(0, 80)}`);
        console.log(`   Snippet: ${snippet.substring(0, 100)}...`);
        console.log('');

        if (title !== 'No title' && url !== 'No URL') {
          validCount++;
        }
      }

      console.log(`Valid results: ${validCount}/${Math.min(5, resultElements.length)}`);
      console.log('✅ BRAVE SEARCH: SUCCESS');
      return validCount >= 3;
    } else {
      console.log('❌ No results found');
      console.log('Sample HTML:', html.substring(0, 1000));
      return false;
    }
  } catch (error) {
    console.log(`❌ BRAVE SEARCH FAILED: ${error.message}`);
    return false;
  } finally {
    await browser.close();
  }
}

testBrave().then(success => {
  console.log(`\nBRAVE RESULT: ${success ? 'WORKING ✅' : 'FAILED ❌'}`);
  process.exit(success ? 0 : 1);
});
