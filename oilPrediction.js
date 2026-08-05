// oilPrediction.js
// ====================
//
// Adds a "get_oil_prediction" function your GPT-powered chatbot can call
// when a user asks about oil price direction. Same architecture as
// goldPrediction.js: fetches the latest prediction JSON live from the
// gold-predictor GitHub repo's raw content URL on every request (no local
// storage, no backend endpoints -- GitHub's storage is genuinely
// persistent, Render's free-tier disk is not).
//
// KEY DIFFERENCE FROM GOLD: the oil predictor runs DAILY (Alpha Vantage's
// WTI endpoint only supports daily granularity), not hourly like gold's
// GoldPriceZ-based feed. So "stale" thresholds here are calibrated in
// days, not hours -- a prediction that's 20 hours old is completely
// normal for oil, whereas the same age would be flagged stale for gold.

import { getOilMarketStatus } from "./oilMarketHours.js";

const OIL_PREDICTION_RAW_URL =
  "https://raw.githubusercontent.com/iAi2025Joy/gold-predictor/main/oil_prediction_latest.json";

// ------------------------------------------------------------------
// 1. TOOL DEFINITION
// ------------------------------------------------------------------

export function getOilPredictionToolDefinition() {
  return {
    type: "function",
    function: {
      name: "get_oil_prediction",
      description:
        "Get a statistical PREDICTION/forecast for crude oil's (WTI) next-day direction and price, based on the system's own historical data and model -- along with that model's own snapshot of the price at its last update. Use this when the user wants a prediction, forecast, or direction (up/down) for OIL specifically (not gold -- use get_gold_prediction for that). Also use this whenever the user asks about the oil prediction system's methodology, data sources, historical data range, number of data points, accuracy, whether it factors in interest rates/the dollar/market volatility, or whether it uses news -- never answer such questions from general knowledge or guesswork. IMPORTANT: this predictor updates once per DAY (not hourly like the gold predictor), since the underlying WTI price data source only provides daily granularity -- if the user asks why the oil prediction is 'stale' compared to gold's, explain this real, structural difference plainly rather than treating it as a malfunction.",
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

export async function handleOilPredictionCall(userTimezone) {
  let data;
  try {
    const resp = await fetch(OIL_PREDICTION_RAW_URL, { cache: "no-store" });
    if (!resp.ok) {
      return JSON.stringify({
        error: `Oil prediction data is not available yet (HTTP ${resp.status}). The oil predictor updater job may not have run yet, or this feature may still be new.`,
      });
    }
    data = await resp.json();
  } catch (err) {
    return JSON.stringify({ error: "Could not reach oil prediction data: " + err.message });
  }

  const updatedAt = data.updated_at ? new Date(data.updated_at) : null;
  let safeTimezone = "UTC";
  if (userTimezone) {
    try {
      new Intl.DateTimeFormat(undefined, { timeZone: userTimezone });
      safeTimezone = userTimezone;
    } catch {
      // invalid zone string -- keep the UTC fallback
    }
  }
  const formattedUpdatedAt = updatedAt && !isNaN(updatedAt.getTime())
    ? updatedAt.toLocaleString(undefined, {
        year: "numeric", month: "short", day: "numeric",
        hour: "2-digit", minute: "2-digit", timeZoneName: "short",
        timeZone: safeTimezone,
      })
    : null;
  const ageHoursSinceScriptRun = updatedAt ? Math.round((Date.now() - updatedAt.getTime()) / 3600000) : null;

  const marketStatus = getOilMarketStatus(new Date(), safeTimezone);

  // IMPORTANT: staleness must be measured against historical_data_end_date
  // (how old the underlying WTI market data actually is), NOT updated_at
  // (which only reflects when the script last RAN -- the script can run
  // fresh every day while still fetching underlying data that is itself
  // several days old, since Alpha Vantage's WTI feed has been confirmed,
  // via real data, to carry its own multi-day reporting lag on top of our
  // daily schedule). Checking updated_at alone was a real bug: it would
  // show a fresh run and silently skip the stale warning even when the
  // actual price data was days old -- exactly what caused a confidently
  // stated, meaningfully outdated price with no caveat.
  const dataEndDate = data.historical_data_end_date ? new Date(data.historical_data_end_date) : null;
  const dataAgeDays = dataEndDate ? Math.round((Date.now() - dataEndDate.getTime()) / 86400000) : null;

  let staleWarning = null;
  if (dataAgeDays !== null && dataAgeDays >= 2) {
    staleWarning = `Warning: the underlying oil price data is ${dataAgeDays} days old (last real data point: ${data.historical_data_end_date}) -- Alpha Vantage's WTI feed has a real, inherent reporting lag beyond just this job's own daily schedule. You MUST say plainly that current_price_usd may not reflect today's actual market price, and by roughly how many days it may be out of date -- do not state it as if it were today's price.`;
  }

  const response = {
    prediction: data.prediction ?? null,
    confidence_note: data.confidence_note ?? null,
    model_type_used: data.model_type_used ?? null,
    current_price_usd: data.current_price_usd ?? null,
    predicted_price_usd: data.predicted_price_usd ?? null,
    price_model_type_used: data.price_model_type_used ?? null,
    price_direction_vs_current: data.price_direction_vs_current ?? null,
    direction_price_agreement: data.direction_price_agreement ?? null,
    price_confidence_note: data.price_confidence_note ?? null,
    is_price_prediction_significant: data.is_price_prediction_significant ?? null,
    model_accuracy_vs_baseline: data.model_accuracy_vs_baseline ?? null,
    is_statistically_significant: data.is_statistically_significant ?? null,
    latest_news_sentiment_score: data.latest_news_sentiment_score ?? null,
    news_sentiment_currently_available: data.news_sentiment_currently_available ?? null,
    macro_data_currently_available: data.macro_data_currently_available ?? null,
    current_fed_funds_midpoint_pct: data.current_fed_funds_midpoint_pct ?? null,
    yield_minus_fed_funds_spread_pct: data.yield_minus_fed_funds_spread_pct ?? null,
    fed_rate_data_currently_available: data.fed_rate_data_currently_available ?? null,
    latest_oil_implied_volatility_pct: data.latest_oil_implied_volatility_pct ?? null,
    implied_vol_data_currently_available: data.implied_vol_data_currently_available ?? null,
    implied_volatility_expected_range: data.implied_volatility_expected_range ?? null,
    recency_weighting_half_life_days: data.recency_weighting_half_life_days ?? null,
    rolling_predictions_tracked: data.rolling_predictions_tracked ?? null,
    rolling_direction_accuracy: data.rolling_direction_accuracy ?? null,
    rolling_price_mae_usd: data.rolling_price_mae_usd ?? null,
    rolling_accuracy_is_significant: data.rolling_accuracy_is_significant ?? null,
    rolling_accuracy_note: data.rolling_accuracy_note ?? null,
    next_economic_event_name: data.next_economic_event_name ?? null,
    hours_until_next_economic_event: data.hours_until_next_economic_event ?? null,
    in_high_impact_event_window_48h: data.in_high_impact_event_window_48h ?? null,
    economic_calendar_needs_update: data.economic_calendar_needs_update ?? null,
    cross_asset_consistency_with_dollar: data.cross_asset_consistency_with_dollar ?? null,
    cross_asset_consistency_note: data.cross_asset_consistency_note ?? null,
    historical_data_start_date: data.historical_data_start_date ?? null,
    historical_data_end_date: data.historical_data_end_date ?? null,
    data_points_used: data.data_points_used ?? null,
    updated_at: data.updated_at ?? null,
    formatted_updated_at: formattedUpdatedAt,
    data_age_days_of_underlying_price: dataAgeDays,
    stale_warning: staleWarning,
    oil_market_open: marketStatus.isOpen,
    // Pre-written, ready-to-use strings for the closed-market case --
    // GPT is instructed to insert these VERBATIM rather than compose its
    // own phrasing. Same fix already applied to gold after prose-only
    // instructions repeatedly failed there in production (e.g. a
    // response correctly said "Expected Price When Markets Reopen" but
    // still labeled the other figure "Current Price" despite the market
    // being closed) -- shifting exact wording into server-computed data
    // is far more reliable than trusting compositional phrasing.
    market_closed_statement: marketStatus.isOpen ? null : "Oil markets are currently closed.",
    price_label: marketStatus.isOpen ? "Current Price" : "Last Price Recorded Before Markets Closed",
    predicted_price_label: marketStatus.isOpen ? "Predicted Price (Next Trading Day)" : "Expected Price When Markets Reopen",
    market_reopens_note: marketStatus.formattedNextOpenAt,
    important_context_for_the_model:
      "This is a statistical estimate for CRUDE OIL (WTI), NOT financial advice, and NOT gold -- do not mix up oil and gold data in your answer. MARKET HOURS -- use the pre-written labels, do not compose your own phrasing (a fix already needed for gold after prose-only instructions repeatedly failed there, including a response that correctly said 'Expected Price When Markets Reopen' for one figure but still labeled the other 'Current Price' despite markets being closed): use price_label and predicted_price_label VERBATIM as the literal labels for current_price_usd and predicted_price_usd, every time you mention them, including in any summary/bullet section -- do not substitute your own wording even if it seems equivalent. If market_closed_statement is non-null, it must be the literal first sentence of your response, verbatim, nothing before it. Also state market_reopens_note exactly as given (already formatted in the user's own local timezone) when present. SEPARATELY from market-hours labeling, current_price_usd is ALSO a SNAPSHOT from historical_data_end_date, NOT a live/real-time price regardless of market status -- Alpha Vantage's WTI data source has been confirmed to carry a real, multi-day reporting lag beyond just this job's own daily schedule, so this price can genuinely be several days old even right after a fresh run. If the user wants the genuinely live oil price right now with no interest in a forecast, use get_live_oil_price instead -- that gives a fresh, on-demand number, the same distinction gold draws between get_gold_prediction and get_live_gold_price; the two numbers may differ, which is normal and expected. Always state current_price_usd alongside its explicit date (historical_data_end_date, e.g. 'as of July 29, 2026') in addition to using price_label as its title -- do not use a vague phrase like 'as of the last update' with no actual date stated. You can additionally mention formatted_updated_at (the exact date/time this script last ran, including time) if the user asks specifically when the script itself ran, as distinct from which day's price data it reflects. If stale_warning is present, explicitly tell the user the price may be meaningfully out of date -- do not state it as if it were today's price. If the user says the real price differs from what you're reporting, do NOT argue -- acknowledge the data lag plainly and suggest get_live_oil_price or a live source. If predicted_price_usd is present, use predicted_price_label as its title -- but if is_price_prediction_significant is false, ALSO label the price itself with the exact bracketed tag '(Model Best Guess)' right after the number (e.g. '$82.73 (Model Best Guess)') -- ALWAYS use this exact phrase, NEVER say '(not reliable)' or other wording for this label. ONE CLEAR HEADLINE PREDICTION (same fix already applied to gold -- a confirmed real complaint: showing two separate, sometimes-disagreeing figures as equally-weighted competing predictions read as a confusing self-contradiction, not useful information): lead with exactly ONE headline prediction -- the direction call ('prediction' field) with context on its reliability, in a single clear sentence. Treat predicted_price_usd as a SEPARATE, secondary data point after the headline, clearly framed as an independent estimate, not a second competing prediction -- it comes from a different model trained to estimate a specific number, while 'prediction' comes from a model trained specifically for direction, so a mismatch is normal, expected statistical noise, not a system error. ALWAYS use price_direction_vs_current ('higher'/'lower'/'the same') verbatim to describe the price forecast's direction, never infer it yourself. If direction_price_agreement is false, mention it plainly and matter-of-factly as one line of context, not as a warning or reason for alarm -- these are independent estimates answering different questions, so this is normal, not a fault. If the user asks what algorithm is used, use model_type_used/price_model_type_used -- the system tries both a simple model and gradient boosting every run and picks whichever genuinely performs better on real held-out data, so which one is 'in use' can change over time. If the user asks what data this is based on, whether it factors in interest rates/the dollar/market volatility, answer using: historical_data_start_date/historical_data_end_date, data_points_used, latest_news_sentiment_score/news_sentiment_currently_available, and current_fed_funds_midpoint_pct/yield_minus_fed_funds_spread_pct/fed_rate_data_currently_available (real Fed-rate-derived inputs this model factors in) -- do not guess or generalize. ALWAYS include BOTH accuracy figures in EVERY prediction response, not just when specifically asked (a confirmed real request this fixes -- these real, honestly-tracked numbers should be visible by default, not hidden behind a follow-up question), clearly distinguished as two different things: (1) the ONE-TIME HISTORICAL backtest, from model_accuracy_vs_baseline (and is_statistically_significant) -- how the model performed on held-out historical data at training time; and (2) LIVE RECENT accuracy, from the rolling_* fields below -- how it's actually been doing on its last 100 real live predictions, which is the more current, real-world answer to 'is this any good lately': if rolling_predictions_tracked is 0, say plainly that live accuracy tracking is still building up real history and none is available yet; otherwise state rolling_direction_accuracy as a plain percentage and rolling_predictions_tracked as the sample size (e.g. 'this system has called direction correctly on X% of its last N live predictions'), and be honest about rolling_accuracy_is_significant -- if it's false, say the number is too small a sample (or too close to a coin flip) to call a real edge yet, don't oversell it, even if the raw percentage happens to look good or bad. If the user specifically asks for MORE detail on live/recent accuracy, ALSO give the full rolling_accuracy_note, distinct from model_accuracy_vs_baseline (the one-time historical backtest). If the user asks about upcoming economic events, use next_economic_event_name/hours_until_next_economic_event/in_high_impact_event_window_48h -- this only flags WHEN volatility is more likely, never WHICH WAY oil will move. If the user asks whether oil's prediction is consistent with the dollar's, use cross_asset_consistency_with_dollar/cross_asset_consistency_note (oil and the dollar are usually inversely related; pointing opposite ways is the expected/reassuring case). If the user asks about a RANGE of likely prices, expected volatility, how much oil might move, or wants a probabilistic range instead of a single point forecast, use implied_volatility_expected_range -- REAL, market-derived data (CBOE's Crude Oil ETF Volatility Index, computed from actual USO options market prices, same methodology as VIX). CRITICAL: this range describes HOW FAR price might move, NOT WHICH DIRECTION -- separate information from the direction/price prediction fields, never present it as agreeing or disagreeing with the direction call. Mention it's roughly a one-standard-deviation range (about 68% likelihood), not a guarantee. If prediction is 'insufficient_data', tell the user the oil prediction system is still gathering enough real price history -- give no direction or price forecast in that case. If is_statistically_significant is false, tell the user plainly that no reliable directional edge was detected. Always mention this is not financial advice.",
  };

  return JSON.stringify(response);
}
