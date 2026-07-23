// liveGoldPrice.js
// ===================
//
// A dedicated, on-demand live gold price fetch using GoldPriceZ.com --
// the same real-time financial data API the hourly prediction pipeline
// already uses (see gold_predictor_updater.py). Reused here directly for
// the chatbot's "what is the current gold price" questions, since a
// genuine financial data API is more reliable for this than web search:
// SERP-based search reflects Google's CACHED index of a page, which can
// lag behind a live-updating price by an unpredictable amount -- a real,
// structural limitation, not something fixable with better search
// instructions.
//
// Confirmed real format (validated against the user's own real terminal
// test earlier): the response is DOUBLE-ENCODED JSON -- parse twice.
//
//   GET https://goldpricez.com/api/rates/currency/usd/measure/ounce
//   Header: X-API-KEY: <key>
//
// BUDGET NOTE: GoldPriceZ's free tier is 60 requests/hour, TOTAL, shared
// with the existing hourly scheduled prediction job (which uses 1/hour).
// This on-demand path adds one request per "current price" chat question
// on top of that. Under normal traffic this is a non-issue, but if this
// specific question type gets asked more than ~59 times within a single
// hour, later calls in that hour would start failing -- a real, disclosed
// risk given we don't control chat traffic volume.

const GOLDPRICEZ_API_KEY = process.env.GOLDPRICEZ_API_KEY || "";

export async function fetchLiveGoldPrice() {
  if (!GOLDPRICEZ_API_KEY) {
    throw new Error("GOLDPRICEZ_API_KEY is not set.");
  }

  const response = await fetch("https://goldpricez.com/api/rates/currency/usd/measure/ounce", {
    headers: { "X-API-KEY": GOLDPRICEZ_API_KEY },
  });

  if (!response.ok) {
    throw new Error(`GoldPriceZ API returned ${response.status}`);
  }

  // Double-encoded JSON: the raw response body is a JSON STRING containing
  // another JSON object as escaped text. A single .json() call correctly
  // un-escapes the outer string layer but returns a JS string, not an
  // object; parse it again to get the real data.
  const outer = await response.json();
  const data = typeof outer === "string" ? JSON.parse(outer) : outer;

  return {
    price: parseFloat(data.ounce_price_usd),
    updatedAt: data.gmt_ounce_price_usd_updated || null,
  };
}

export function getLiveGoldPriceToolDefinition() {
  return {
    type: "function",
    function: {
      name: "get_live_gold_price",
      description:
        "Get the genuinely live, real-time current price of gold, fetched fresh at this exact moment from a dedicated financial data API. Use this specifically when the user asks for the CURRENT or LIVE gold price ONLY, with no interest in a prediction/forecast -- this is MORE reliable for a live gold price than search_web, since search results reflect a search engine's cached index of a webpage (which can lag behind the true live price), while this calls a real-time financial data API directly. For a gold PREDICTION/forecast, use get_gold_prediction instead. For anything other than gold's price (news, other topics), use search_web instead.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  };
}

export async function handleLiveGoldPriceCall() {
  try {
    const { price, updatedAt } = await fetchLiveGoldPrice();
    return JSON.stringify({
      live_price_usd: price,
      fetched_at: new Date().toISOString(),
      source_reported_update_time: updatedAt,
      important_context_for_the_model:
        "This is a genuinely live price, fetched at this exact moment from a real-time financial data API -- state it as such (e.g. 'the current live price of gold is $X, just fetched'). This is NOT financial advice.",
    });
  } catch (err) {
    return JSON.stringify({
      error: `Live price fetch failed (technical error: ${err.message}). Tell the user the live price lookup is temporarily unavailable, and offer to use the search function or the prediction system's last known price instead.`,
    });
  }
}
