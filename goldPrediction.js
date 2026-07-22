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
        "Get the latest live and historical gold (GLD) price data along with a statistical prediction for the next trading period. Use this whenever the user asks about gold price direction, gold predictions, or whether gold will go up or down.",
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
    model_accuracy_vs_baseline: data.model_accuracy_vs_baseline ?? null,
    is_statistically_significant: data.is_statistically_significant ?? null,
    updated_at: data.updated_at ?? null,
    data_age_minutes: ageMinutes,
    stale_warning: staleWarning,
    important_context_for_the_model:
      "This is a statistical estimate from a backtested model, NOT financial advice. If prediction is 'insufficient_data', tell the user the system is still gathering enough real price history to make a prediction, and give no direction. If is_statistically_significant is false, tell the user plainly that no reliable directional edge was detected rather than stating a confident direction. Always mention this is not financial advice.",
  };

  return JSON.stringify(response);
}
