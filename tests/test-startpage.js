#!/usr/bin/env node

/**
 * Test StartPage search independently via axios + cheerio
 * StartPage proxies Google results with less aggressive bot detection
 */

import axios from 'axios';
import * as cheerio from 'cheerio';

async function testStartPage() {
  console.log('=== TESTING STARTPAGE SEARCH ===');

  try {
    const query = 'javascript tutorial';
    const startTime = Date.now();

    const response = await axios.get('https://www.startpage.com/sp/search', {
      params: { query, count: 5 },
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      timeout: 15000,
    });

    const loadTime = Date.now() - startTime;
    console.log(`✓ Response received in ${loadTime}ms`);
    console.log(`✓ Status: ${response.status}`);
    console.log(`✓ HTML length: ${response.data.length} characters`);

    const $ = cheerio.load(response.data);

    // Check for results
    const resultElements = $('.result');
    console.log(`✓ Found ${resultElements.length} .result elements`);

    if (resultElements.length === 0) {
      console.log('❌ No result elements found');
      return false;
    }

    console.log('\n--- SAMPLE RESULTS ---');

    resultElements.slice(0, 5).each((i, element) => {
      const $el = $(element);

      const $titleLink = $el.find('a.result-title.result-link').first();
      const title = $titleLink.text().trim();
      const url = $titleLink.attr('href');
      const snippet = $el.find('p.description').first().text().trim();

      if (title && url) {
        console.log(`${i + 1}. ${title}`);
        console.log(`   URL: ${url}`);
        console.log(`   Snippet: ${snippet.substring(0, 120)}...`);
        console.log('');
      }
    });

    // Count valid results
    let validCount = 0;
    resultElements.each((_i, el) => {
      const $el = $(el);
      const $link = $el.find('a.result-title.result-link').first();
      if ($link.length > 0 && $link.attr('href') && $link.text().trim()) {
        validCount++;
      }
    });

    console.log(`Valid results: ${validCount}/${resultElements.length}`);

    if (validCount > 0) {
      console.log('✅ STARTPAGE SEARCH: SUCCESS');
      return true;
    } else {
      console.log('❌ No valid results found');
      return false;
    }
  } catch (error) {
    console.log(`❌ STARTPAGE SEARCH FAILED: ${error.message}`);
    return false;
  }
}

testStartPage().then(success => {
  console.log(`\nSTARTPAGE RESULT: ${success ? 'WORKING ✅' : 'FAILED ❌'}`);
  process.exit(success ? 0 : 1);
});
