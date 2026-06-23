#!/usr/bin/env node
// Inspect StartPage full result structure
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

  // Get the second result (first is often an ad)
  const results = $('.result');
  console.log(`Total .result elements: ${results.length}\n`);

  results.slice(0, 4).each((i, el) => {
    console.log(`=== RESULT ${i + 1} ===`);

    // Get ALL links inside this result
    const links = $(el).find('a[href]');
    console.log(`Links found: ${links.length}`);

    links.each((j, linkEl) => {
      const href = $(linkEl).attr('href');
      const text = $(linkEl).text().trim();
      const cls = $(linkEl).attr('class') || '';
      console.log(`  Link ${j + 1}: class="${cls.substring(0, 60)}"`);
      console.log(`    Text: "${text.substring(0, 100)}"`);
      console.log(`    Href: "${href && href.substring(0, 120)}"`);
    });

    // Get all text blocks (p, span, div with substantial text)
    const textBlocks = $(el)
      .find('p, .description, .snippet, [class*="desc"], span')
      .filter((j, span) => {
        const t = $(span).text().trim();
        return t.length > 50 && !t.startsWith('<');
      });

    console.log(`Text blocks (longer than 50 chars): ${textBlocks.length}`);
    textBlocks.slice(0, 3).each((j, tb) => {
      const tag = tb.tagName;
      const cls = $(tb).attr('class') || '';
      const text = $(tb).text().trim();
      console.log(
        `  ${tag}.${cls.substring(0, 50)}: "${text.substring(0, 150)}..."`
      );
    });

    console.log('');
  });
})();
