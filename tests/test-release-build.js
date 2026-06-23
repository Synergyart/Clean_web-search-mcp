#!/usr/bin/env node

/**
 * Test the release build at E:\web\dist
 * Uses the production SearchEngine directly from the release directory
 */

import { SearchEngine } from '../../web/dist/search-engine.js';

async function testReleaseBuild() {
  console.log('=== TESTING RELEASE BUILD (E:\\web\\dist) ===\n');

  const searchEngine = new SearchEngine();

  const queries = [
    { query: 'javascript programming', numResults: 5 },
    { query: 'climate change effects', numResults: 5 },
    { query: 'machine learning basics', numResults: 3 },
  ];

  let passed = 0;
  const total = queries.length;

  for (let i = 0; i < queries.length; i++) {
    const { query, numResults } = queries[i];
    console.log(`Test ${i + 1}/${total}: "${query}"`);
    console.log('─'.repeat(50));

    try {
      const startTime = Date.now();
      const result = await searchEngine.search({
        query,
        numResults,
        timeout: 15000,
      });
      const elapsed = Date.now() - startTime;

      console.log(`  Engine: ${result.engine}`);
      console.log(`  Results: ${result.results.length}`);
      console.log(`  Time: ${elapsed}ms`);

      if (result.results.length === 0) {
        console.log(`  ❌ FAILED — No results returned`);
        continue;
      }

      // Validate results
      let validCount = 0;
      for (const r of result.results) {
        if (r.title && r.url && r.url.startsWith('http')) {
          validCount++;
        }
      }

      console.log(`  Valid results: ${validCount}/${result.results.length}`);

      // Show first result
      const first = result.results[0];
      console.log(`  Sample: "${first.title.substring(0, 80)}"`);
      console.log(`          ${first.url.substring(0, 80)}`);

      if (validCount > 0) {
        console.log(`  ✅ PASSED`);
        passed++;
      } else {
        console.log(`  ❌ FAILED — No valid results`);
      }
    } catch (error) {
      console.log(`  ❌ FAILED — ${error.message}`);
    }

    if (i < total - 1) {
      console.log('\n  Waiting 2s before next test...');
      await new Promise(r => setTimeout(r, 2000));
    }
    console.log('');
  }

  console.log('═'.repeat(50));
  console.log(`Results: ${passed}/${total} passed`);

  await searchEngine.closeAll();

  if (passed === total) {
    console.log('✅ RELEASE BUILD: All tests passed');
    process.exit(0);
  } else {
    console.log('❌ RELEASE BUILD: Some tests failed');
    process.exit(1);
  }
}

testReleaseBuild().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
