// testSearchProviders.js
// ====================
//
// A standalone diagnostic script -- run manually to verify all 6 search
// provider API keys are actually valid and working, BEFORE trusting the
// fallback chain in front of real users. Tests each provider directly
// and individually (not through the fallback logic), so a working
// provider #3 can't hide a broken provider #1 the way it might if you
// only tested the fallback chain as a whole.
//
// USAGE:
//   node testSearchProviders.js
// (needs the same 6 env vars set as server.js/examSystemCacheRefresher.js
// use: BRIGHTDATA_API_KEY, TAVILY_API_KEY1, FIRECRAWL_API_KEY,
// SCRAPERAPI_KEY, SCRAPPA_API_KEY, SERPAPI_KEY -- run this locally with
// them exported in your shell, or via Render's shell/one-off job feature
// so it picks up the same environment variables already set there.)
//
// For each provider, prints:
//   PASS -- provider name, how many results came back, and a snippet of
//           the first result's title/url, so you can eyeball that the
//           response is genuinely real search data, not an error page
//           or empty shell
//   FAIL -- provider name and the real error message (missing key,
//           wrong endpoint, invalid credentials, exhausted credits,
//           etc.) -- exactly what needs fixing for that one provider

import {
  PROVIDER_ORDER,
} from "./searchProviders.js";

// Re-implements a single direct call per provider (rather than
// importing the individual searchX functions, which searchProviders.js
// does not export -- only the combined performFallbackSearch is
// exported, by design, since callers should go through the fallback
// chain in real use). This file deliberately duplicates minimal,
// simplified versions of each call so a failure in provider #1 can
// never prevent providers #2-6 from being tested -- each is fully
// independent here, unlike relying on the fallback loop's built-in
// short-circuit-on-first-success behavior.

const TEST_QUERY = "current weather in London";

async function testBrightData() {
  const apiKey = process.env.BRIGHTDATA_API_KEY;
  if (!apiKey) throw new Error("BRIGHTDATA_API_KEY is not set.");
  const zone = process.env.BRIGHTDATA_ZONE || "serp_api1";
  const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(TEST_QUERY)}`;
  const response = await fetch("https://api.brightdata.com/request", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ zone, url: searchUrl, format: "json", data_format: "parsed" }),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const data = await response.json();
  const organic = data.organic || data.organic_results || [];
  if (organic.length === 0) throw new Error("No organic results in response -- check the response shape matches what this script expects.");
  return { count: organic.length, sample: `${organic[0].title || "(no title)"} -- ${organic[0].link || organic[0].url || "(no url)"}` };
}

async function testTavily() {
  const apiKey = process.env.TAVILY_API_KEY1;
  if (!apiKey) throw new Error("TAVILY_API_KEY1 is not set.");
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: TEST_QUERY, search_depth: "basic", max_results: 3 }),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const data = await response.json();
  const results = data.results || [];
  if (results.length === 0) throw new Error("No results in response.");
  return { count: results.length, sample: `${results[0].title || "(no title)"} -- ${results[0].url || "(no url)"}` };
}

async function testFirecrawl() {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) throw new Error("FIRECRAWL_API_KEY is not set.");
  const response = await fetch("https://api.firecrawl.dev/v1/search", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: TEST_QUERY, limit: 3 }),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const data = await response.json();
  const items = data.data || [];
  if (items.length === 0) throw new Error("No results in response.");
  return { count: items.length, sample: `${items[0].title || "(no title)"} -- ${items[0].url || "(no url)"}` };
}

async function testScraperApi() {
  const apiKey = process.env.SCRAPERAPI_KEY;
  if (!apiKey) throw new Error("SCRAPERAPI_KEY is not set.");
  const url = `https://api.scraperapi.com/structured-data/google/search?api_key=${apiKey}&query=${encodeURIComponent(TEST_QUERY)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const data = await response.json();
  const organic = data.organic_results || [];
  if (organic.length === 0) throw new Error("No organic_results in response -- check the response shape matches what this script expects.");
  return { count: organic.length, sample: `${organic[0].title || "(no title)"} -- ${organic[0].link || "(no url)"}` };
}

async function testScrappa() {
  const apiKey = process.env.SCRAPPA_API_KEY;
  if (!apiKey) throw new Error("SCRAPPA_API_KEY is not set.");
  // UNVERIFIED endpoint, same caveat as searchProviders.js -- this is
  // the first real test of whether this guess is correct. A failure
  // here specifically may mean the path/shape needs adjusting, not
  // necessarily that the key itself is bad -- check the real error
  // message below carefully.
  const response = await fetch(`https://api.scrappa.co/v1/search/google?q=${encodeURIComponent(TEST_QUERY)}&num=3`, {
    headers: { "Authorization": `Bearer ${apiKey}` },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const data = await response.json();
  const organic = data.organic_results || data.results || [];
  if (organic.length === 0) throw new Error("No results in response -- check the response shape matches what this script expects.");
  return { count: organic.length, sample: `${organic[0].title || "(no title)"} -- ${organic[0].link || organic[0].url || "(no url)"}` };
}

async function testSerpApi() {
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) throw new Error("SERPAPI_KEY is not set.");
  const url = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(TEST_QUERY)}&api_key=${apiKey}&num=3`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const data = await response.json();
  if (data.error) throw new Error(`SerpApi error: ${data.error}`);
  const organic = data.organic_results || [];
  if (organic.length === 0) throw new Error("No organic_results in response.");
  return { count: organic.length, sample: `${organic[0].title || "(no title)"} -- ${organic[0].link || "(no url)"}` };
}

const TESTS = {
  brightdata: testBrightData,
  tavily: testTavily,
  firecrawl: testFirecrawl,
  scraperapi: testScraperApi,
  scrappa: testScrappa,
  serpapi: testSerpApi,
};

async function runAllTests() {
  console.log(`Testing all ${PROVIDER_ORDER.length} search providers with query: "${TEST_QUERY}"\n`);
  const summary = [];

  for (const providerName of PROVIDER_ORDER) {
    const testFn = TESTS[providerName];
    process.stdout.write(`${providerName.padEnd(12)} ... `);
    try {
      const result = await testFn();
      console.log(`PASS  (${result.count} results)`);
      console.log(`             sample: ${result.sample}\n`);
      summary.push({ provider: providerName, pass: true });
    } catch (err) {
      console.log(`FAIL`);
      console.log(`             error: ${err.message}\n`);
      summary.push({ provider: providerName, pass: false, error: err.message });
    }
  }

  const passCount = summary.filter((s) => s.pass).length;
  console.log(`\n${passCount} of ${summary.length} providers passed.`);
  if (passCount < summary.length) {
    console.log("Providers that failed need their key/setup checked before relying on the fallback chain covering them.");
  }
}

runAllTests().catch((err) => {
  console.error("Fatal error running tests:", err);
  process.exit(1);
});
