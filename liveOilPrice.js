// liveOilPrice.js
// ====================
//
// Adds a "get_live_oil_price" function for genuinely real-time WTI crude
// oil price queries -- mirrors liveGoldPrice.js's role for gold. Calls
// OilPriceAPI.com directly and fresh on every request (NOT via search,
// same reasoning as gold's live price tool: search results reflect a
// cached index that lags behind true live prices unpredictably).
//
// WHY THIS EXISTS: the oil PREDICTION tool (oilPrediction.js) reads from
// oil_prediction_latest.json, which is only updated once per day AND
// confirmed (via real data) to itself lag Alpha Vantage's WTI feed by
// several more days on top of that -- so its current_price_usd can be
// meaningfully stale. This tool exists specifically to give a genuinely
// fresh number when that's what the user actually wants, the same
// distinction gold already draws between get_gold_prediction (snapshot,
// possibly stale) and get_live_gold_price (fresh, on-demand).
//
// VERIFICATION STATUS: CONFIRMED against a real authenticated call. Real
// response shape received:
// {"status":"success","data":{"price":92.17,"formatted":"$92.17",
//  "currency":"USD","code":"WTI_USD","created_at":"...","updated_at":"...",
//  "type":"spot_price","unit":"barrel","source":"market_reporting",
//  "data_status":"current","freshness":{"status":"current",
//  "age_seconds":1687,"expected_max_age_seconds":1800},
//  "changes":{"24h":{"amount":4.27,"percent":4.86,"previous_price":87.9,...}},
//  "as_of":"...","synthetic":false,"stale":false,"age_days":0,
//  "metadata":{"source":"market_reporting","source_description":"..."}}}
// Notably richer than assumed from docs alone -- includes native
// "stale"/"synthetic" boolean flags and a freshness object, which this
// parser now surfaces directly rather than re-deriving staleness itself.

const OILPRICEAPI_KEY = process.env.OILPRICEAPI_KEY || "";
const OILPRICEAPI_URL = "https://api.oilpriceapi.com/v1/prices/latest?by_code=WTI_USD";

// ------------------------------------------------------------------
// 1. TOOL DEFINITION
// ------------------------------------------------------------------

export function getLiveOilPriceToolDefinition() {
  return {
    type: "function",
    function: {
      name: "get_live_oil_price",
      description:
        "Get the genuinely CURRENT, real-time crude oil (WTI) spot price, fetched fresh from a dedicated live price API on every call -- NOT a prediction, and NOT the (possibly several-days-stale) snapshot price bundled with get_oil_prediction. Use this whenever the user wants to know what oil is trading at RIGHT NOW, with no interest in a forecast -- e.g. 'what's the oil price right now', 'what is WTI trading at', or if the user says the price from get_oil_prediction seems wrong/outdated and wants the real current number.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  };
}

// ------------------------------------------------------------------
// 2. FUNCTION HANDLER
// ------------------------------------------------------------------

export async function handleLiveOilPriceCall() {
  if (!OILPRICEAPI_KEY) {
    return JSON.stringify({
      error: "OILPRICEAPI_KEY is not set on the server -- live oil price lookups are not currently configured.",
    });
  }

  let payload;
  try {
    const resp = await fetch(OILPRICEAPI_URL, {
      headers: { Authorization: `Token ${OILPRICEAPI_KEY}` },
      cache: "no-store",
    });
    if (!resp.ok) {
      const bodyText = await resp.text().catch(() => "");
      return JSON.stringify({
        error: `OilPriceAPI request failed (HTTP ${resp.status}). Raw response: ${bodyText.slice(0, 300)}`,
      });
    }
    payload = await resp.json();
  } catch (err) {
    return JSON.stringify({ error: "Could not reach OilPriceAPI: " + err.message });
  }

  if (!payload || payload.status !== "success" || !payload.data) {
    return JSON.stringify({
      error: `Unexpected response shape from OilPriceAPI -- 'status'/'data' fields not as expected. Raw response: ${JSON.stringify(payload).slice(0, 300)}`,
    });
  }

  const d = payload.data;
  if (typeof d.price !== "number" && typeof d.price !== "string") {
    return JSON.stringify({
      error: `OilPriceAPI response is missing the expected 'price' field. Raw data: ${JSON.stringify(d).slice(0, 300)}`,
    });
  }

  const price = Number(d.price);
  const isStale = d.stale === true || (d.data_status && d.data_status !== "current");
  const isSynthetic = d.synthetic === true;
  const ageSeconds = d.freshness && typeof d.freshness.age_seconds === "number" ? d.freshness.age_seconds : null;
  const change24h = d.changes && d.changes["24h"] ? d.changes["24h"] : null;

  let dataQualityWarning = null;
  if (isSynthetic) {
    dataQualityWarning = "Warning: this price is flagged by the API as SYNTHETIC (estimated/modeled), not a real observed market price -- say so explicitly to the user rather than presenting it as a genuine live quote.";
  } else if (isStale) {
    dataQualityWarning = `Warning: the API itself flags this price as stale (age: ${ageSeconds ?? "unknown"} seconds). Mention this to the user rather than presenting it with full confidence.`;
  }

  return JSON.stringify({
    live_price_usd: price,
    formatted: d.formatted || `$${price.toFixed(2)}`,
    unit: d.unit || "barrel",
    code: d.code || "WTI_USD",
    as_of: d.as_of || d.created_at || d.updated_at || null,
    age_seconds: ageSeconds,
    is_stale: isStale,
    is_synthetic: isSynthetic,
    data_quality_warning: dataQualityWarning,
    change_24h_amount: change24h ? change24h.amount : null,
    change_24h_percent: change24h ? change24h.percent : null,
    source: d.source || (d.metadata && d.metadata.source_description) || null,
    important_context_for_the_model:
      "This is a GENUINELY LIVE, real-time WTI crude oil price, fetched fresh just now -- NOT a prediction, and NOT gold. State it plainly as the current price, with its as_of timestamp. If data_quality_warning is present, relay it honestly rather than hiding it. If change_24h_percent is present, you may mention it as useful context (e.g. 'up 4.9% over the last 24 hours') since it's real data from the same call, not a guess. This is fundamentally different from get_oil_prediction's current_price_usd, which comes from a daily-updated, possibly several-days-stale snapshot -- if the user has previously been given a stale prediction-snapshot price and this live number differs, explain that this new number is the genuinely current one and the earlier figure was from older data, don't treat the difference as an error. This tool does not provide a forecast -- if the user also wants a prediction, direction, or forecast, call get_oil_prediction separately.",
  });
}

