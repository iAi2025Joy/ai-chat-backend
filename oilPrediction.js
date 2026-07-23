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
        "Get a statistical PREDICTION/forecast for crude oil's (WTI) next-day direction and price, based on the system's own historical data and model -- along with that model's own snapshot of the price at its last update. Use this when the user wants a prediction, forecast, or direction (up/down) for OIL specifically (not gold -- use get_gold_prediction for that). Also use this whenever the user asks about the oil prediction system's methodology, data sources, historical data range, number of data points, or whether it uses news -- never answer such questions from general knowledge or guesswork. IMPORTANT: this predictor updates once per DAY (not hourly like the gold predictor), since the underlying WTI price data source only provides daily granularity -- if the user asks why the oil prediction is 'stale' compared to gold's, explain this real, structural difference plainly rather than treating it as a malfunction.",
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

export async function handleOilPredictionCall() {
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
  const ageHours = updatedAt ? Math.round((Date.now() - updatedAt.getTime()) / 3600000) : null;
  // Stale threshold calibrated for DAILY updates -- 48 hours (2 missed
  // days), not the 3-hour threshold used for gold's hourly-updated data.
  let staleWarning = null;
  if (ageHours !== null && ageHours > 48) {
    staleWarning = `Warning: this oil prediction is ${ageHours} hours old (more than 2 days) and may be stale -- the daily update job may have failed to run. Say so explicitly to the user.`;
  }

  const response = {
    prediction: data.prediction ?? null,
    confidence_note: data.confidence_note ?? null,
    current_price_usd: data.current_price_usd ?? null,
    predicted_price_usd: data.predicted_price_usd ?? null,
    price_confidence_note: data.price_confidence_note ?? null,
    is_price_prediction_significant: data.is_price_prediction_significant ?? null,
    model_accuracy_vs_baseline: data.model_accuracy_vs_baseline ?? null,
    is_statistically_significant: data.is_statistically_significant ?? null,
    latest_news_sentiment_score: data.latest_news_sentiment_score ?? null,
    news_sentiment_currently_available: data.news_sentiment_currently_available ?? null,
    historical_data_start_date: data.historical_data_start_date ?? null,
    historical_data_end_date: data.historical_data_end_date ?? null,
    data_points_used: data.data_points_used ?? null,
    updated_at: data.updated_at ?? null,
    data_age_hours: ageHours,
    stale_warning: staleWarning,
    important_context_for_the_model:
      "This is a statistical estimate for CRUDE OIL (WTI), NOT financial advice, and NOT gold -- do not mix up oil and gold data in your answer. ALWAYS state the current_price_usd value explicitly, labeled clearly as the price AS OF THE MODEL'S LAST DAILY UPDATE (oil updates once per day, unlike gold's hourly updates -- mention this real difference if relevant, e.g. if the user compares the two or asks why oil data seems less fresh). If predicted_price_usd is present, state it as the model's forecast for the next trading day -- but if is_price_prediction_significant is false, explicitly say this dollar figure is just the model's best guess and was NOT shown to be more accurate than assuming the price stays the same. If the user asks what data this is based on, answer using the real fields provided: historical_data_start_date/historical_data_end_date, data_points_used, and latest_news_sentiment_score/news_sentiment_currently_available -- do not guess or generalize. If prediction is 'insufficient_data', tell the user the oil prediction system is still gathering enough real price history (it started later than gold's, and accumulates only 1 data point per day, so this takes roughly 60+ days from when it began, meaningfully longer than gold's warm-up period) -- give no direction or price forecast in that case. If is_statistically_significant is false, tell the user plainly that no reliable directional edge was detected. Always mention this is not financial advice.",
  };

  return JSON.stringify(response);
}
