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
    data_age_minutes: ageMinutes,
    stale_warning: staleWarning,
    important_context_for_the_model:
      "This is a statistical estimate from a backtested model, NOT financial advice. ALWAYS state the current_price_usd value explicitly, but label it clearly as the price AS OF THE MODEL'S LAST UPDATE, not as a live/real-time price -- e.g. say 'as of the model's last hourly update, gold was at $X,XXX per ounce' rather than just 'gold is currently at $X,XXX' (that price can be up to about an hour old, since it's a snapshot from when this prediction was last computed, not a fresh live fetch -- if the user wants the genuinely live price right now, that's a separate question the search_web function answers, and the two numbers may differ slightly, which is normal and expected, not an error). If predicted_price_usd is present, ALSO state it as the model's forecast (e.g. 'the model's forecast for the next period is approximately $X,XXX') -- but if is_price_prediction_significant is false, explicitly say this dollar figure is just the model's best guess and was NOT shown to be more accurate than assuming the price stays the same, so the user should not treat it as a reliable forecast. If the user asks what data this is based on, what history it uses, whether it uses news, or asks you to prove/verify its data sources, answer using the real fields provided: historical_data_start_date/historical_data_end_date (the actual real date range of price history used), data_points_used (the real count), and latest_news_sentiment_score/news_sentiment_currently_available (whether a real, gold-relevant news sentiment reading is currently feeding the model, and its value if so -- if news_sentiment_currently_available is false, say plainly that no gold-relevant news was found in the most recent check, which is a normal and expected outcome, not a malfunction). Do not guess or generalize about the data sources -- use only these real fields. CRITICAL: this tool provides exactly ONE forecast value, for the single immediate next period only -- it does NOT provide a multi-day, weekly, or day-by-day forecast, and does NOT provide a weekly or monthly average forecast either (the underlying historical data mixes two different time resolutions, so a genuine calendar-based week/month-ahead forecast is not currently supported by the underlying math -- this is a real technical limitation, not a policy choice). If the user asks for prices across multiple future days (e.g. 'the next 7 days'), a week-ahead average, or a month-ahead average, you MUST NOT repeat, average, or extrapolate this single value to simulate one -- that would misrepresent what the system actually supports. Instead, respond professionally and plainly: apologize that a week-ahead or month-ahead forecast isn't available with the current model, briefly note it would need the underlying data to be restructured onto a consistent time grid first, and then offer the single next-period estimate as what IS available right now. If prediction is 'insufficient_data', tell the user the system is still gathering enough real price history to make a prediction, and give no direction or price forecast. If is_statistically_significant is false, tell the user plainly that no reliable directional edge was detected rather than stating a confident direction. Always mention this is not financial advice.",
  };

  return JSON.stringify(response);
}
