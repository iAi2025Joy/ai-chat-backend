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

import { getOilMarketStatus } from "./oilMarketHours.js";

const OILPRICEAPI_KEY = process.env.OILPRICEAPI_KEY || "";
const OILPRICEAPI_URL = "https://api.oilpriceapi.com/v1/prices/latest?by_code=WTI_USD";

// ------------------------------------------------------------------
// Raw fetch, extracted so oilLiveInference.js (added for oil's live-
// inference capability, mirroring gold's) can reuse the exact same
// OilPriceAPI call instead of duplicating it -- mirrors
// liveGoldPrice.js's fetchLiveGoldPrice() shape (throws on failure,
// caller decides how to handle it). handleLiveOilPriceCall below is
// unchanged in behavior, just refactored to call this internally.
// ------------------------------------------------------------------
export async function fetchLiveOilPrice() {
  if (!OILPRICEAPI_KEY) {
    throw new Error("OILPRICEAPI_KEY is not set.");
  }

  const resp = await fetch(OILPRICEAPI_URL, {
    headers: { Authorization: `Token ${OILPRICEAPI_KEY}` },
    cache: "no-store",
  });
  if (!resp.ok) {
    const bodyText = await resp.text().catch(() => "");
    throw new Error(`OilPriceAPI request failed (HTTP ${resp.status}). Raw response: ${bodyText.slice(0, 300)}`);
  }
  const payload = await resp.json();

  if (!payload || payload.status !== "success" || !payload.data) {
    throw new Error(`Unexpected response shape from OilPriceAPI. Raw response: ${JSON.stringify(payload).slice(0, 300)}`);
  }

  const d = payload.data;
  if (typeof d.price !== "number" && typeof d.price !== "string") {
    throw new Error(`OilPriceAPI response is missing the expected 'price' field. Raw data: ${JSON.stringify(d).slice(0, 300)}`);
  }

  const isStale = d.stale === true || (d.data_status && d.data_status !== "current");
  const isSynthetic = d.synthetic === true;
  const ageSeconds = d.freshness && typeof d.freshness.age_seconds === "number" ? d.freshness.age_seconds : null;

  return {
    price: Number(d.price),
    isStale,
    isSynthetic,
    ageSeconds,
    asOf: d.as_of || d.created_at || d.updated_at || null,
    raw: d,
  };
}

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

export async function handleLiveOilPriceCall(userTimezone) {
  let live;
  try {
    live = await fetchLiveOilPrice();
  } catch (err) {
    return JSON.stringify({ error: err.message });
  }

  let safeTimezone = "UTC";
  if (userTimezone) {
    try {
      new Intl.DateTimeFormat(undefined, { timeZone: userTimezone });
      safeTimezone = userTimezone;
    } catch {
      // invalid zone string -- keep the UTC fallback
    }
  }
  const marketStatus = getOilMarketStatus(new Date(), safeTimezone);

  const d = live.raw;
  const price = live.price;
  const isStale = live.isStale;
  const isSynthetic = live.isSynthetic;
  const ageSeconds = live.ageSeconds;
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
    as_of: live.asOf,
    age_seconds: ageSeconds,
    is_stale: isStale,
    oil_market_open: marketStatus.isOpen,
    market_closed_statement: marketStatus.isOpen ? null : "Oil markets are currently closed.",
    price_label: marketStatus.isOpen ? "Current Price" : "Last Price Recorded Before Markets Closed",
    market_reopens_note: marketStatus.formattedNextOpenAt,
    is_synthetic: isSynthetic,
    data_quality_warning: dataQualityWarning,
    change_24h_amount: change24h ? change24h.amount : null,
    change_24h_percent: change24h ? change24h.percent : null,
    source: d.source || (d.metadata && d.metadata.source_description) || null,
    important_context_for_the_model:
      "This is a GENUINELY LIVE, real-time WTI crude oil price, fetched fresh just now -- NOT a prediction, and NOT gold. Use price_label VERBATIM as the label for live_price_usd (do not compose your own wording -- this fix already had to be applied to gold and oil's prediction tools after prose-only instructions repeatedly failed there). If market_closed_statement is non-null, it must be the literal first sentence of your response, verbatim. Include the as_of timestamp regardless. If oil_market_open is false, this price is likely the last traded price before that pause (either the daily 1-hour maintenance break, 5-6 PM ET Mon-Thu, or the weekend closure), not a live, moving quote -- mention market_reopens_note (already formatted in the user's own local timezone) rather than implying active, ongoing trading. If data_quality_warning is present, relay it honestly rather than hiding it -- this is a separate, API-native signal and can apply regardless of oil_market_open. If change_24h_percent is present, you may mention it as useful context (e.g. 'up 4.9% over the last 24 hours') since it's real data from the same call, not a guess. This is fundamentally different from get_oil_prediction's current_price_usd, which comes from a daily-updated, possibly several-days-stale snapshot -- if the user has previously been given a stale prediction-snapshot price and this live number differs, explain that this new number is the genuinely current one and the earlier figure was from older data, don't treat the difference as an error. This tool does not provide a forecast -- if the user also wants a prediction, direction, or forecast, call get_oil_prediction separately.",
  });
}

