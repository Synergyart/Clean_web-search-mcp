#!/usr/bin/env node
// Inspect StartPage HTML structure
import axios from 'axios';
import * as cheerio from 'cheerio';

(async () => {
  const resp = await axios.get('https://www.startpage.com/sp/search', {
    params: { query: 'javascript tutorial', count: 5 },
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
    timeout: 10000,
  });
  const $ = cheerio.load(resp.data);

  // Look for various result containers
  const selectors = [
    '.result',
    '.search-result',
    '[data-type="result"]',
    'article',
    '.w-gl__result',
    '.result-item',
    '.vo-sp__link',
    '.results__item',
    '.mainline-results',
    'div[class*="result"]',
    'section[class*="result"]',
  ];

  console.log('Selector counts:');
  selectors.forEach(sel => {
    const count = $(sel).length;
    if (count > 0) console.log(`  ${sel}: ${count}`);
  });

  // Find the first result container
  let firstResult = null;
  for (const sel of [
    '.result',
    '.search-result',
    'article',
    '.w-gl__result',
    '.result-item',
  ]) {
    const el = $(sel).first();
    if (el.length > 0) {
      firstResult = el;
      console.log(`\nUsing selector: ${sel}`);
      break;
    }
  }

  if (firstResult) {
    const html = firstResult.html();
    console.log('\nFirst result HTML (truncated):');
    console.log(html.substring(0, 3000));

    // Check title and link
    const title = firstResult
      .find('h3, h2, .title, .result-title, a[class*="title"]')
      .first();
    console.log(
      '\nTitle element:',
      title.length ? title.text().trim() : 'NOT FOUND'
    );

    const link = firstResult.find('a[href*="http"]').first();
    console.log('Link:', link.length ? link.attr('href') : 'NOT FOUND');

    const snippet = firstResult
      .find('p, .description, .snippet, .result-snippet, span[class*="desc"]')
      .first();
    console.log(
      'Snippet:',
      snippet.length ? snippet.text().trim().substring(0, 200) : 'NOT FOUND'
    );
  } else {
    // Dump all external links
    console.log('\nAll external links:');
    $('a[href]').each((i, el) => {
      const href = $(el).attr('href');
      if (href && href.startsWith('http') && !href.includes('startpage.com')) {
        console.log(`${i}: ${href.substring(0, 100)}`);
        console.log(`   Text: ${$(el).text().trim().substring(0, 80)}`);
      }
      if (i > 20) return false;
    });
  }

  console.log('\nBody classes:', $('body').attr('class'));
  console.log('Title tag:', $('title').text());
})();
