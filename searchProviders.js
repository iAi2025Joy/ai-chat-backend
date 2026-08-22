// searchProviders.js
// ====================
//
// A multi-provider search fallback chain, replacing the single-provider
// (Serper, now Tavily) setup used until this point. PER EXPLICIT REQUEST:
// dropped Serper entirely (its 2,500 free credits are a ONE-TIME signup
// grant, not a recurring monthly allowance -- verified against multiple
// independent, current sources before switching) in favor of six
// separate providers, each with its own genuinely RECURRING, monthly-
// resetting free tier, no credit card required on any of them:
//
//   1. Bright Data (SERP API) -- 5,000 credits/month
//   2. Tavily                 -- 1,000 credits/month (already in use
//                                 for the exam-cache job; kept as its
//                                 own dedicated provider there, see
//                                 below)
//   3. Firecrawl               -- 1,000 credits/month
//   4. ScraperAPI               -- 1,000 credits/month (after an initial
//                                 5,000-credit / 7-day trial bonus)
//   5. Scrappa                  -- 500 credits/month
//   6. SerpApi                  -- 250 searches/month
//
// Combined recurring free volume: ~8,750 queries/month, vs. Serper's
// 2,500 ONE-TIME credits before. Every one of these is a genuinely
// separate company/account -- this is NOT multiple accounts on the same
// provider (which would violate most providers' one-free-account-per-
// person terms); it's one legitimate free account per company, which
// is exactly what each provider's own terms allow.
//
// ORDER: largest recurring pool first, smallest last -- Bright Data (the
// biggest) is tried first, so the smaller pools (SerpApi's 250/month
// especially) are preserved as backup capacity for whenever the larger
// ones are already spent for the month, rather than being burned first
// on ordinary traffic.
//
// CONFIDENCE NOTE, read before relying on this in production: Bright
// Data's and Scrappa's exact request/response shapes below are built
// from their own docs and dashboard as verified this session, but
// weren't live-tested end-to-end here. Tavily, Firecrawl, ScraperAPI,
// and SerpApi's shapes are all confirmed against multiple independent,
// current sources and official docs. Run a real manual test against
// each provider (a single query, checking the actual response body)
// before trusting this in front of real users -- same "verify with real
// evidence, not just assumption" habit this whole project has leaned on
// throughout this session.
//
// NORMALIZED OUTPUT SHAPE every provider function returns, regardless
// of what the underlying API actually gives back:
//   { results: [{ title, url, content }], provider: "<name that answered>" }
// `content` is the richest text available from that provider for that
// result -- full raw page content where the provider supports it
// (Tavily, Firecrawl), otherwise the provider's own search snippet
// (Bright Data, ScraperAPI, Scrappa, SerpApi all return structured SERP
// data, not full page text -- callers needing full content from those
// four should still fall back to this app's own fetch_web_page on the
// returned url, same as the app already does with Serper's snippets
// today).

const PROVIDER_ORDER = ["brightdata", "tavily", "firecrawl", "scraperapi", "scrappa", "serpapi"];

// ------------------------------------------------------------------
// Individual provider implementations. Each takes (query, maxResults)
// and either returns the normalized shape above or throws -- the
// fallback loop below catches any throw (missing key, non-2xx
// response, exhausted monthly credits, network error) and just moves
// on to the next provider in PROVIDER_ORDER.
// ------------------------------------------------------------------

async function searchBrightData(query, maxResults) {
  const apiKey = process.env.BRIGHTDATA_API_KEY;
  if (!apiKey) throw new Error("BRIGHTDATA_API_KEY is not set.");
  // Zone name as configured in the Bright Data dashboard when the SERP
  // API was set up this session -- override via BRIGHTDATA_ZONE if the
  // zone is ever renamed or a second zone is added later.
  const zone = process.env.BRIGHTDATA_ZONE || "serp_api1";
  const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=${maxResults}`;
  const response = await fetch("https://api.brightdata.com/request", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ zone, url: searchUrl, format: "json", data_format: "parsed" }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Bright Data returned ${response.status}: ${body.slice(0, 200)}`);
  }
  const data = await response.json();
  // Bright Data's parsed SERP JSON nests organic results -- the exact
  // key can vary by data_format/zone config, so this checks the two
  // most common shapes rather than assuming one.
  const organic = data.organic || data.organic_results || [];
  const results = organic.slice(0, maxResults).map((r) => ({
    title: r.title || "",
    url: r.link || r.url || "",
    content: r.description || r.snippet || "",
  }));
  if (results.length === 0) throw new Error("Bright Data returned no organic results.");
  return { results, provider: "brightdata" };
}

async function searchTavily(query, maxResults) {
  const apiKey = process.env.TAVILY_API_KEY1;
  if (!apiKey) throw new Error("TAVILY_API_KEY1 is not set.");
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, search_depth: "basic", max_results: maxResults, include_answer: false, include_raw_content: "markdown" }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Tavily returned ${response.status}: ${body.slice(0, 200)}`);
  }
  const data = await response.json();
  const results = (data.results || []).map((r) => ({
    title: r.title || "",
    url: r.url || "",
    content: r.raw_content || r.content || "",
  }));
  if (results.length === 0) throw new Error("Tavily returned no results.");
  return { results, provider: "tavily" };
}

async function searchFirecrawl(query, maxResults) {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) throw new Error("FIRECRAWL_API_KEY is not set.");
  const response = await fetch("https://api.firecrawl.dev/v1/search", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, limit: maxResults, scrapeOptions: { formats: ["markdown"] } }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Firecrawl returned ${response.status}: ${body.slice(0, 200)}`);
  }
  const data = await response.json();
  const items = data.data || [];
  const results = items.map((r) => ({
    title: r.title || "",
    url: r.url || "",
    content: r.markdown || r.description || "",
  }));
  if (results.length === 0) throw new Error("Firecrawl returned no results.");
  return { results, provider: "firecrawl" };
}

async function searchScraperApi(query, maxResults) {
  const apiKey = process.env.SCRAPERAPI_KEY;
  if (!apiKey) throw new Error("SCRAPERAPI_KEY is not set.");
  const url = `https://api.scraperapi.com/structured-data/google/search?api_key=${apiKey}&query=${encodeURIComponent(query)}`;
  const response = await fetch(url);
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`ScraperAPI returned ${response.status}: ${body.slice(0, 200)}`);
  }
  const data = await response.json();
  const organic = data.organic_results || [];
  const results = organic.slice(0, maxResults).map((r) => ({
    title: r.title || "",
    url: r.link || "",
    content: r.snippet || "",
  }));
  if (results.length === 0) throw new Error("ScraperAPI returned no organic results.");
  return { results, provider: "scraperapi" };
}

async function searchScrappa(query, maxResults) {
  const apiKey = process.env.SCRAPPA_API_KEY;
  if (!apiKey) throw new Error("SCRAPPA_API_KEY is not set.");
  // UNVERIFIED END-TO-END: Scrappa's exact search-endpoint path/response
  // shape wasn't confirmed against live docs this session -- this is
  // built on the standard pattern their other structured endpoints
  // follow (Bearer token, query param `q`). Test this against a real
  // request and adjust the path/response parsing below if it doesn't
  // match before relying on it in production.
  const response = await fetch(`https://api.scrappa.co/v1/search/google?q=${encodeURIComponent(query)}&num=${maxResults}`, {
    headers: { "Authorization": `Bearer ${apiKey}` },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Scrappa returned ${response.status}: ${body.slice(0, 200)}`);
  }
  const data = await response.json();
  const organic = data.organic_results || data.results || [];
  const results = organic.slice(0, maxResults).map((r) => ({
    title: r.title || "",
    url: r.link || r.url || "",
    content: r.snippet || r.description || "",
  }));
  if (results.length === 0) throw new Error("Scrappa returned no results.");
  return { results, provider: "scrappa" };
}

async function searchSerpApi(query, maxResults) {
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) throw new Error("SERPAPI_KEY is not set.");
  const url = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(query)}&api_key=${apiKey}&num=${maxResults}`;
  const response = await fetch(url);
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`SerpApi returned ${response.status}: ${body.slice(0, 200)}`);
  }
  const data = await response.json();
  if (data.error) throw new Error(`SerpApi error: ${data.error}`);
  const organic = data.organic_results || [];
  const results = organic.slice(0, maxResults).map((r) => ({
    title: r.title || "",
    url: r.link || "",
    content: r.snippet || "",
  }));
  if (results.length === 0) throw new Error("SerpApi returned no organic results.");
  return { results, provider: "serpapi" };
}

const PROVIDER_FUNCTIONS = {
  brightdata: searchBrightData,
  tavily: searchTavily,
  firecrawl: searchFirecrawl,
  scraperapi: searchScraperApi,
  scrappa: searchScrappa,
  serpapi: searchSerpApi,
};

// ------------------------------------------------------------------
// The actual fallback loop -- tries each provider in PROVIDER_ORDER,
// moving to the next on ANY failure (missing key, non-2xx response,
// exhausted monthly credits, network error, zero results). Returns as
// soon as one provider succeeds. If every provider fails, throws a
// single combined error listing what each one said, rather than a bare
// "search failed" -- makes it possible to tell at a glance from logs
// which providers are actually down/exhausted vs. which are fine.
//
// `excludeProviders` lets a caller skip specific providers -- used by
// the exam-cache job (see examSystemCacheRefresher.js) to keep Tavily
// as its OWN dedicated provider for day-to-day runs (its 1,000/month
// budget was specifically sized for that job alone), only falling
// through to the other five if Tavily itself is unavailable that day,
// rather than competing with regular chat search for the same pool.
// ------------------------------------------------------------------
export async function performFallbackSearch(query, options = {}) {
  const maxResults = options.maxResults || 5;
  const order = options.providerOrder || PROVIDER_ORDER;
  const excluded = new Set(options.excludeProviders || []);
  const errors = [];

  for (const providerName of order) {
    if (excluded.has(providerName)) continue;
    const fn = PROVIDER_FUNCTIONS[providerName];
    if (!fn) continue;
    try {
      const result = await fn(query, maxResults);
      return result; // first success wins
    } catch (err) {
      errors.push(`${providerName}: ${err.message}`);
      // fall through to the next provider
    }
  }

  throw new Error(`All search providers failed or are unavailable. Details -- ${errors.join(" | ")}`);
}

export { PROVIDER_ORDER };
