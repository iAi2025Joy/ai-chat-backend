// goldPrediction.js
// ====================
//
// Adds a "get_gold_prediction" function your GPT-powered chatbot can call
// when a user asks about gold price direction (e.g. "will gold go up
// tomorrow?", "what's your gold prediction?").
//
// This is the Node.js/Express equivalent of what was originally written
// as a PHP file, rewritten to match your actual server.js (Express +
// the official OpenAI Node SDK).

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GOLD_PREDICTION_FILE = path.join(__dirname, "gold_prediction_latest.json");
const GOLD_HISTORY_FILE = path.join(__dirname, "gold_price_history.json");
const BACKEND_SHARED_SECRET = process.env.BACKEND_SHARED_SECRET || "";

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
// 2. FUNCTION HANDLER -- call this when the OpenAI response includes a
//    tool_call with function.name === "get_gold_prediction".
// ------------------------------------------------------------------

export function handleGoldPredictionCall(argsJson) {
  let args = {};
  try {
    args = argsJson ? JSON.parse(argsJson) : {};
  } catch {
    args = {};
  }
  const horizon = args.horizon || "next_day";

  if (!fs.existsSync(GOLD_PREDICTION_FILE)) {
    return JSON.stringify({
      error: "Prediction data is not available yet. The prediction updater job may not have run.",
    });
  }

  let data;
  try {
    data = JSON.parse(fs.readFileSync(GOLD_PREDICTION_FILE, "utf8"));
  } catch {
    return JSON.stringify({ error: "Prediction data file could not be read." });
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
      "This is a statistical estimate from a backtested model, NOT financial advice. If is_statistically_significant is false, tell the user plainly that no reliable directional edge was detected rather than stating a confident direction. Always mention this is not financial advice.",
  };

  return JSON.stringify(response);
}

// ------------------------------------------------------------------
// 3. EXPRESS ROUTE HANDLERS -- register these in server.js:
//      app.get("/gold-history", handleGoldHistoryGet);
//      app.post("/update-gold-prediction", handleGoldPredictionUpdate);
// ------------------------------------------------------------------

function checkSharedSecret(req) {
  const provided = req.headers["x-shared-secret"] || "";
  return Boolean(BACKEND_SHARED_SECRET) && provided === BACKEND_SHARED_SECRET;
}

export function handleGoldHistoryGet(req, res) {
  if (!checkSharedSecret(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  if (!fs.existsSync(GOLD_HISTORY_FILE)) {
    return res.status(404).json({ error: "No history yet" });
  }
  res.type("application/json").send(fs.readFileSync(GOLD_HISTORY_FILE, "utf8"));
}

export function handleGoldPredictionUpdate(req, res) {
  if (!checkSharedSecret(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const data = req.body;
  if (!data || !data.prediction || !data.history) {
    return res.status(400).json({
      error: "Invalid payload: expected 'prediction' and 'history' fields",
    });
  }

  const { history, ...predictionOnly } = data;

  try {
    fs.writeFileSync(GOLD_HISTORY_FILE, JSON.stringify(history));
    fs.writeFileSync(GOLD_PREDICTION_FILE, JSON.stringify(predictionOnly, null, 2));
  } catch (err) {
    return res.status(500).json({ error: "Failed to write one or both files: " + err.message });
  }

  res.json({
    status: "ok",
    history_rows: history.length,
  });
}
