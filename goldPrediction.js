// goldPrediction.js
// ====================
//
// Adds a "get_gold_prediction" function your GPT-powered chatbot can call
// when a user asks about gold price direction.
//
// ARCHITECTURE (simplified after a real production issue): this used to
// read a local file that a separate cron job POSTed to this backend.
// That broke because Render's free web service loses its local files
// every time it goes to sleep from inactivity and wakes back up again --
// not just on redeploys. The fix: the prediction data now lives directly
// in the gold-predictor GitHub repo (committed there by the GitHub
// Actions workflow after each run), and this function just fetches it
// live from GitHub's raw content URL on every request. GitHub's storage
// is genuinely persistent, unlike this service's own disk. This also
// removes the need for the /gold-history and /update-gold-prediction
// endpoints and the shared-secret auth entirely.

const GOLD_PREDICTION_RAW_URL =
  "https://raw.githubusercontent.com/iAi2025Joy/gold-predictor/main/gold_prediction_latest.json";

// ------------------------------------------------------------------
// 1. TOOL DEFINITION -- pass this in the `tools` array of your
//    openai.chat.completions.create(...) call.
// ------------------------------------------------------------------

export function getGoldPredictionToolDefinition() {
  return {
    type: "function",
    function: {
      name: "get_gold_prediction",
      description:
        "Get a statistical PREDICTION/forecast for gold's next trading period (direction and forecasted price), based on the system's own historical data and model -- along with that model's own snapshot of the price at its last update (which may be up to an hour old). Use this when the user wants a prediction, forecast, or direction (up/down), or asks about the prediction system's methodology/data sources. If the user ONLY wants the current/live price right now, with NO interest in a prediction, prefer the search_web function instead for a genuinely real-time price -- use this function's price only as part of answering a prediction-related question, not as the primary way to answer a simple 'what's the gold price right now' question. Also use this whenever the user asks about the gold prediction system's methodology, data sources, historical data range, number of data points, whether it uses news, or asks you to prove/verify/explain what data or method the gold prediction is based on -- never answer such questions from general knowledge or guesswork.",
      parameters: {
        type: "object",
        properties: {
          horizon: {
            type: "string",
            enum: ["next_hour", "next_day"],
            description:
              "Which prediction horizon the user is asking about. Default to next_day if unclear.",
          },
        },
        required: [],
      },
    },
  };
}

// ------------------------------------------------------------------
// 2. FUNCTION HANDLER -- call this (and await it -- this is now async,
//    since it fetches over the network) when the OpenAI response
//    includes a tool_call with function.name === "get_gold_prediction".
// ------------------------------------------------------------------

export async function handleGoldPredictionCall(argsJson) {
  let args = {};
  try {
    args = argsJson ? JSON.parse(argsJson) : {};
  } catch {
    args = {};
  }
  const horizon = args.horizon || "next_day";

  let data;
  try {
    const resp = await fetch(GOLD_PREDICTION_RAW_URL, { cache: "no-store" });
    if (!resp.ok) {
      return JSON.stringify({
        error: `Prediction data is not available yet (HTTP ${resp.status}). The prediction updater job may not have run yet.`,
      });
    }
    data = await resp.json();
  } catch (err) {
    return JSON.stringify({ error: "Could not reach prediction data: " + err.message });
  }

  const updatedAt = data.updated_at ? new Date(data.updated_at) : null;
  const ageMinutes = updatedAt ? Math.round((Date.now() - updatedAt.getTime()) / 60000) : null;
  let staleWarning = null;
  if (ageMinutes !== null && ageMinutes > 180) {
    staleWarning = `Warning: this prediction is ${ageMinutes} minutes old and may be stale. Say so explicitly to the user.`;
  }

  const response = {
    horizon_requested: horizon,
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
    latest_real_yield_10y_pct: data.latest_real_yield_10y_pct ?? null,
    latest_dxy: data.latest_dxy ?? null,
    latest_vix: data.latest_vix ?? null,
    macro_data_currently_available: data.macro_data_currently_available ?? null,
    current_fed_funds_midpoint_pct: data.current_fed_funds_midpoint_pct ?? null,
    yield_minus_fed_funds_spread_pct: data.yield_minus_fed_funds_spread_pct ?? null,
    fed_rate_data_currently_available: data.fed_rate_data_currently_available ?? null,
    latest_gold_implied_volatility_pct: data.latest_gold_implied_volatility_pct ?? null,
    implied_vol_data_currently_available: data.implied_vol_data_currently_available ?? null,
    implied_volatility_expected_range: data.implied_volatility_expected_range ?? null,
    recency_weighting_half_life_days: data.recency_weighting_half_life_days ?? null,
    rolling_predictions_tracked: data.rolling_predictions_tracked ?? null,
    rolling_direction_accuracy: data.rolling_direction_accuracy ?? null,
    rolling_price_mae_usd: data.rolling_price_mae_usd ?? null,
    rolling_accuracy_is_significant: data.rolling_accuracy_is_significant ?? null,
    rolling_accuracy_note: data.rolling_accuracy_note ?? null,
    cross_asset_consistency_with_dollar: data.cross_asset_consistency_with_dollar ?? null,
    cross_asset_consistency_note: data.cross_asset_consistency_note ?? null,
    dxy_prediction_direction: data.dxy_prediction_direction ?? null,
    dxy_data_age_hours: data.dxy_data_age_hours ?? null,
    next_economic_event_name: data.next_economic_event_name ?? null,
    hours_until_next_economic_event: data.hours_until_next_economic_event ?? null,
    in_high_impact_event_window_48h: data.in_high_impact_event_window_48h ?? null,
    economic_calendar_needs_update: data.economic_calendar_needs_update ?? null,
    historical_data_start_date: data.historical_data_start_date ?? null,
    historical_data_end_date: data.historical_data_end_date ?? null,
    data_points_used: data.data_points_used ?? null,
    updated_at: data.updated_at ?? null,
    data_age_minutes: ageMinutes,
    stale_warning: staleWarning,
    important_context_for_the_model:
      "This is a statistical estimate from a backtested model, NOT financial advice. ALWAYS state the current_price_usd value explicitly, but label it clearly as the price AS OF THE MODEL'S LAST UPDATE, not as a live/real-time price -- e.g. say 'as of the model's last hourly update, gold was at $X,XXX per ounce' rather than just 'gold is currently at $X,XXX' (that price can be up to about an hour old, since it's a snapshot from when this prediction was last computed, not a fresh live fetch -- if the user wants the genuinely live price right now, that's a separate question the search_web function answers, and the two numbers may differ slightly, which is normal and expected, not an error). If predicted_price_usd is present, ALSO state it as the model's forecast (e.g. 'the model's forecast for the next period is approximately $X,XXX') -- but if is_price_prediction_significant is false, explicitly say this dollar figure is just the model's best guess and was NOT shown to be more accurate than assuming the price stays the same, so the user should not treat it as a reliable forecast. CRITICAL CONSISTENCY RULE (a confirmed real bug this is fixing): the 'prediction' field (up/down) and predicted_price_usd come from two SEPARATE, independent models -- a direction classifier and a price regression -- and they do NOT always agree with each other, this is a real and expected limitation, not an error. NEVER describe the price forecast as an 'increase' or 'higher' or 'decrease'/'lower' based on the 'prediction' field or your own mental comparison of the two dollar figures -- ALWAYS use the exact word given in price_direction_vs_current ('higher', 'lower', or 'the same') to describe how predicted_price_usd compares to current_price_usd, since that field is computed directly and deterministically and is guaranteed correct, unlike inferring it yourself. If direction_price_agreement is false, you MUST explicitly tell the user the two parts of the model disagree right now (e.g. 'note: the model's direction call and its specific price estimate don't fully agree with each other today, which happens sometimes and is worth treating as an extra reason for caution') -- do not silently paper over the disagreement or pick whichever framing sounds more confident. If the user asks what algorithm or type of model is being used, or whether it's a 'simple' model or something more advanced like machine learning, use model_type_used/price_model_type_used -- these tell you EXACTLY which of two candidate models was actually selected for this run (either 'logistic_regression'/'linear_regression', the simpler baseline models, or 'gradient_boosting', a more complex model) based on real, measured performance on held-out test data, not a fixed choice -- explain that the system tries both every run and picks whichever genuinely performs better, so which one is 'in use' can change over time as more data comes in. Do not claim a fixed algorithm is always used if these fields say otherwise. If the user asks what data this is based on, what history it uses, whether it uses news, whether it factors in interest rates/the dollar/market volatility, or asks you to prove/verify its data sources, answer using the real fields provided: historical_data_start_date/historical_data_end_date (the actual real date range of price history used), data_points_used (the real count), latest_news_sentiment_score/news_sentiment_currently_available (whether a real, gold-relevant news sentiment reading is currently feeding the model, and its value if so), and latest_real_yield_10y_pct/latest_dxy/latest_vix/macro_data_currently_available (the model's most recent real-yield, dollar-index, and VIX readings, which ARE used as model inputs alongside gold's own price action -- these are DAILY-resolution figures from FRED, not intraday, so mention that if the user asks how fresh they are). If news_sentiment_currently_available or macro_data_currently_available is false, say plainly that the relevant data wasn't available in the most recent check, which is a normal and expected outcome, not a malfunction. If the user asks whether gold's own model factors in interest rates, mention current_fed_funds_midpoint_pct and yield_minus_fed_funds_spread_pct as real inputs used by this gold model -- but if the user wants the FULL Fed rate picture (current target range, the Fed's own published outlook, or market rate expectations), tell them you can get that and call get_dxy_prediction instead, since that tool owns the complete, authoritative version of Fed rate data -- do not try to answer the full Fed rate picture using only gold's two limited fields. If the user asks whether this system learns from its past predictions, improves over time, or how accurate it's been LATELY (as opposed to the historical backtest), use rolling_predictions_tracked/rolling_direction_accuracy/rolling_price_mae_usd/rolling_accuracy_is_significant/rolling_accuracy_note -- this is a SEPARATE, live-updating scorecard the system keeps by checking each of its own real past predictions against what actually happened next, distinct from model_accuracy_vs_baseline (which is a one-time historical backtest done at training time). Explain clearly that recency_weighting_half_life_days means recent price data is weighted more heavily than old data when the model retrains (so it adapts somewhat to changing conditions), but this does NOT mean the model changes its past predictions retroactively or does true online learning -- it retrains fresh each run, just with recent data counting more. Do not overstate this as more sophisticated 'self-learning AI' than it actually is. If the user asks about upcoming economic events, whether volatility is expected soon, or when the next Fed decision/CPI/jobs report is, use next_economic_event_name/hours_until_next_economic_event/in_high_impact_event_window_48h -- this comes from a hand-maintained real calendar of known FOMC/CPI/Non-Farm-Payrolls dates (publicly announced by the Fed/BLS well in advance), NOT a prediction of which direction that event will move gold -- be clear this only flags WHEN volatility is more likely, never WHICH WAY gold will move because of it. If economic_calendar_needs_update is true, say plainly that the calendar's known event dates have run out and don't state a next-event date at all -- do not guess or make one up. Do not guess or generalize about the data sources -- use only these real fields. CRITICAL: this tool provides exactly ONE forecast value, for the single immediate next period only -- it does NOT provide a multi-day, weekly, or day-by-day forecast, and does NOT provide a weekly or monthly average forecast either (the underlying historical data mixes two different time resolutions, so a genuine calendar-based week/month-ahead forecast is not currently supported by the underlying math -- this is a real technical limitation, not a policy choice). If the user asks for prices across multiple future days (e.g. 'the next 7 days'), a week-ahead average, or a month-ahead average, you MUST NOT repeat, average, or extrapolate this single value to simulate one -- that would misrepresent what the system actually supports. Instead, respond professionally and plainly: apologize that a week-ahead or month-ahead forecast isn't available with the current model, briefly note it would need the underlying data to be restructured onto a consistent time grid first, and then offer the single next-period estimate as what IS available right now. If prediction is 'insufficient_data', tell the user the system is still gathering enough real price history to make a prediction, and give no direction or price forecast. If is_statistically_significant is false, tell the user plainly that no reliable directional edge was detected rather than stating a confident direction. Always mention this is not financial advice. If the user asks whether gold's prediction is consistent with the dollar's prediction, or asks for a sanity check / second opinion, use cross_asset_consistency_with_dollar and cross_asset_consistency_note -- this compares gold's direction call against the Dollar Index model's own latest direction call (gold and the dollar are usually inversely related, so pointing opposite ways is the expected/reassuring case, and pointing the SAME way is a plausibility flag worth mentioning as extra caution, not proof either model is wrong). If cross_asset_consistency_with_dollar is 'not_available', say plainly that there's no DXY prediction to compare against right now (e.g. it may still be in its own data ramp-up period) rather than guessing. Mention dxy_data_age_hours if asked how current that comparison is, since gold updates hourly but DXY only every 6 hours. If the user asks about a RANGE of likely prices, expected volatility, how much gold might move, or wants a probabilistic range instead of a single point forecast, use implied_volatility_expected_range -- this is REAL, market-derived data (CBOE's Gold ETF Volatility Index, computed from actual GLD options market prices, same methodology as VIX), giving implied_price_range_low/high as a genuine expected range. CRITICAL: this range describes HOW FAR price might move, NOT WHICH DIRECTION -- it is completely separate information from the direction/price prediction fields above (which are this system's own model outputs), and must never be presented as if it agrees or disagrees with the direction call, since IV says nothing about direction. Always mention it's roughly a one-standard-deviation range (about 68% likelihood), not a guarantee. If implied_vol_data_currently_available is false, say plainly that this data wasn't available in the most recent check.",
  };

  return JSON.stringify(response);
}
