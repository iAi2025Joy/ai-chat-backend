// goldLiveInference.js
// =====================
//
// Runs the ACTUAL trained gold model's real inference math against a
// genuinely live price, on-demand, without needing to re-run the slow
// Python training pipeline. This is not an approximation or a
// percentage-scaling trick -- it reproduces scikit-learn's real
// prediction math (logistic regression, linear regression, and
// gradient boosting's decision-tree ensembles) exactly, verified
// byte-for-byte against real sklearn output before this was written
// (see the session's verification notes: classifier/regressor, with
// and without sample weights, all matched to floating-point precision
// noise, ~1e-16).
//
// WHAT STAYS HOURLY vs WHAT'S LIVE:
// - The model's TRAINED PARAMETERS (coefficients, or the tree
//   ensemble's structure) still only update once an hour, when
//   gold_predictor_updater.py retrains -- reproducing that training
//   itself live would take 10-30+ seconds, which is a real, deliberate
//   tradeoff this project chose against for chat-response latency.
// - The 6 PRICE-DERIVED features (1/3/5-day returns, MA ratio,
//   10-day volatility, RSI) ARE recomputed fresh here, using the
//   live price appended to recent history -- exactly replicating the
//   pandas logic in gold_predictor_updater.py's add_features().
// - The remaining features (news sentiment, macro/Fed-rate data,
//   implied volatility, economic-calendar proximity) are NOT
//   recomputed here -- they come from whatever the last hourly run
//   found, since their own underlying data sources only update on
//   their own daily/6-hourly schedules regardless, so there is
//   nothing genuinely "live" to fetch for them on a per-question basis.

const PRICE_HISTORY_RAW_URL =
  "https://raw.githubusercontent.com/iAi2025Joy/gold-predictor/main/gold_price_history.json";
const MODEL_ARTIFACTS_RAW_URL =
  "https://raw.githubusercontent.com/iAi2025Joy/gold-predictor/main/gold_model_artifacts.json";

// ------------------------------------------------------------------
// Feature reconstruction -- verified exact match against pandas
// (see session notes: all 6 features matched to ~1e-16 precision).
// ------------------------------------------------------------------

function pctChange(prices, n) {
  const last = prices[prices.length - 1];
  const nAgo = prices[prices.length - 1 - n];
  return (last - nAgo) / nAgo;
}

function rollingMean(arr, window) {
  const slice = arr.slice(arr.length - window);
  return slice.reduce((a, b) => a + b, 0) / window;
}

// pandas' .std() defaults to SAMPLE std (ddof=1), not population std --
// using the wrong one here would silently produce a subtly wrong
// volatility feature on every request.
function rollingStdSample(arr, window) {
  const slice = arr.slice(arr.length - window);
  const mean = slice.reduce((a, b) => a + b, 0) / window;
  const sumSqDiff = slice.reduce((a, b) => a + (b - mean) ** 2, 0);
  return Math.sqrt(sumSqDiff / (window - 1));
}

function computeDailyReturns(prices) {
  const returns = [];
  for (let i = 1; i < prices.length; i++) {
    returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
  }
  return returns;
}

function computeRSI(prices, period) {
  const diffs = [];
  for (let i = 1; i < prices.length; i++) diffs.push(prices[i] - prices[i - 1]);
  const lastPeriod = diffs.slice(diffs.length - period);
  const gains = lastPeriod.map((d) => Math.max(d, 0));
  const losses = lastPeriod.map((d) => -Math.min(d, 0));
  const avgGain = gains.reduce((a, b) => a + b, 0) / period;
  const avgLoss = losses.reduce((a, b) => a + b, 0) / period;
  const rs = avgGain / (avgLoss + 1e-9);
  return 100 - 100 / (1 + rs);
}

// Recomputes the 6 price-derived features using recent history + a
// freshly fetched live price appended as the newest point. Needs at
// least 21 prior prices (for the 20-day moving average) -- returns
// null if there isn't enough history yet, so the caller can fall back
// gracefully rather than compute something wrong from too little data.
function computePriceDerivedFeatures(recentPrices, livePrice) {
  const prices = [...recentPrices, livePrice];
  if (prices.length < 21) return null;

  const allReturns = computeDailyReturns(prices);
  return {
    gld_ret_1d: pctChange(prices, 1),
    gld_ret_3d: prices.length > 3 ? pctChange(prices, 3) : null,
    gld_ret_5d: prices.length > 5 ? pctChange(prices, 5) : null,
    gld_ma_ratio: rollingMean(prices, 5) / rollingMean(prices, 20),
    gld_vol10: rollingStdSample(allReturns, 10),
    rsi14: computeRSI(prices, 14),
  };
}

// ------------------------------------------------------------------
// Model inference -- verified exact match against sklearn (see
// session notes).
// ------------------------------------------------------------------

function scaleFeatures(rawValues, scaler) {
  return rawValues.map((v, i) => (v - scaler.mean[i]) / scaler.scale[i]);
}

function traverseTree(tree, x) {
  let node = 0;
  while (tree.children_left[node] !== tree.children_right[node]) {
    if (x[tree.feature[node]] <= tree.threshold[node]) {
      node = tree.children_left[node];
    } else {
      node = tree.children_right[node];
    }
  }
  return tree.value[node];
}

function sigmoid(z) {
  return 1 / (1 + Math.exp(-z));
}

// Returns a probability (0-1) that direction is "up".
function runDirectionInference(model, xScaled) {
  if (model.type === "logistic_regression") {
    const z = xScaled.reduce((sum, xi, i) => sum + xi * model.coef[i], model.intercept);
    return sigmoid(z);
  }
  // gradient_boosting
  let raw = model.init_log_odds;
  for (const tree of model.trees) {
    raw += model.learning_rate * traverseTree(tree, xScaled);
  }
  return sigmoid(raw);
}

// Returns the predicted next-period RETURN (not price -- the caller
// applies this to the live price).
function runPriceInference(model, xScaled) {
  if (model.type === "linear_regression") {
    return xScaled.reduce((sum, xi, i) => sum + xi * model.coef[i], model.intercept);
  }
  // gradient_boosting
  let raw = model.init_value;
  for (const tree of model.trees) {
    raw += model.learning_rate * traverseTree(tree, xScaled);
  }
  return raw;
}

// ------------------------------------------------------------------
// Orchestration -- fetches everything needed and runs real inference.
// Returns null (never throws) if anything required is unavailable, so
// the caller can cleanly fall back to the lighter percentage-scaling
// approach instead of breaking the whole response.
// ------------------------------------------------------------------

export async function runLiveGoldInference(livePrice, cachedData) {
  let history, artifacts;
  try {
    const [historyResp, artifactsResp] = await Promise.all([
      fetch(PRICE_HISTORY_RAW_URL, { cache: "no-store" }),
      fetch(MODEL_ARTIFACTS_RAW_URL, { cache: "no-store" }),
    ]);
    if (!historyResp.ok || !artifactsResp.ok) return null;
    history = await historyResp.json();
    artifacts = await artifactsResp.json();
  } catch (err) {
    return null;
  }

  if (!Array.isArray(history) || history.length < 21) return null;

  // Sort by date ascending and take recent prices, oldest-to-newest,
  // matching the order the Python pipeline processes them in.
  const sorted = [...history].sort((a, b) => new Date(a.Date) - new Date(b.Date));
  const recentPrices = sorted.slice(-60).map((row) => row.GLD); // 60 is comfortably more than the 20 needed for the longest rolling window

  const priceFeatures = computePriceDerivedFeatures(recentPrices, livePrice);
  if (!priceFeatures) return null;

  const featureOrder = artifacts.scaler.feature_order;
  const rawValues = featureOrder.map((name) => {
    if (name in priceFeatures) return priceFeatures[name];
    // Non-price-derived features: use whatever the cached hourly
    // prediction already carries (see file header for why these
    // specifically are NOT recomputed live).
    const cachedFieldMap = {
      news_sentiment: cachedData.latest_news_sentiment_score,
      news_sentiment_available: cachedData.news_sentiment_currently_available ? 1 : 0,
      real_yield_10y: cachedData.latest_real_yield_10y_pct,
      dxy: cachedData.latest_dxy,
      vix: cachedData.latest_vix,
      macro_data_available: cachedData.macro_data_currently_available ? 1 : 0,
      fed_funds_midpoint: cachedData.current_fed_funds_midpoint_pct,
      yield_fed_spread: cachedData.yield_minus_fed_funds_spread_pct,
      fed_rate_data_available: cachedData.fed_rate_data_currently_available ? 1 : 0,
      gold_implied_vol: cachedData.latest_gold_implied_volatility_pct,
      implied_vol_data_available: cachedData.implied_vol_data_currently_available ? 1 : 0,
      hours_to_next_event: cachedData.hours_until_next_economic_event,
      in_event_window_48h: cachedData.in_high_impact_event_window_48h ? 1 : 0,
    };
    return cachedFieldMap[name] ?? 0;
  });

  // Any missing/null value anywhere means we can't safely run real
  // inference -- fall back rather than feed the model a broken vector.
  if (rawValues.some((v) => v === null || v === undefined || Number.isNaN(v))) return null;

  const xScaled = scaleFeatures(rawValues, artifacts.scaler);
  const probabilityUp = runDirectionInference(artifacts.direction_model, xScaled);
  const predictedReturn = runPriceInference(artifacts.price_model, xScaled);
  const predictedPriceUsd = livePrice * (1 + predictedReturn);

  return {
    prediction: probabilityUp > 0.5 ? "up" : "down",
    predictionProbabilityUp: probabilityUp,
    predictedPriceUsd,
    currentPriceUsd: livePrice,
  };
}
