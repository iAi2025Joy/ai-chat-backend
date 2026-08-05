// oilLiveInference.js
// =====================
//
// Runs the ACTUAL trained oil model's real inference math against a
// genuinely live price, on-demand, without needing to re-run the slow
// Python training pipeline. This is a direct port of goldLiveInference.js
// (already verified byte-for-byte against real sklearn output), with
// three oil-specific differences, each confirmed by direct comparison
// against oil_predictor_updater.py before this was written:
//
//   1. Feature names use the wti_ prefix (wti_ret_1d, wti_ma_ratio, etc.)
//      instead of gld_, and oil_implied_vol instead of gold_implied_vol.
//   2. Oil's Python pipeline CLIPS its 1/3/5-day return features to
//      +/-200% (RETURN_CLIP = 2.0 in add_features()) -- gold's does NOT
//      do this. Confirmed by direct comparison of both add_features()
//      functions. Omitting this here would be a real, if usually
//      inconsequential, divergence from the model's actual trained
//      preprocessing -- see clipReturn below.
//   3. Reads from oil's own separate data files (oil_price_history.json,
//      oil_model_artifacts.json, oil_news_sentiment_history.json), not
//      gold's.
//
// Everything else -- the scaler math, tree traversal, sigmoid, RSI
// formula, moving-average-ratio formula, rolling-std formula -- is
// IDENTICAL between the two models (confirmed by direct comparison of
// gold_predictor_updater.py's and oil_predictor_updater.py's
// add_features() functions), so those functions are reused verbatim,
// not re-derived.

const PRICE_HISTORY_RAW_URL =
  "https://raw.githubusercontent.com/iAi2025Joy/gold-predictor/main/oil_price_history.json";
const MODEL_ARTIFACTS_RAW_URL =
  "https://raw.githubusercontent.com/iAi2025Joy/gold-predictor/main/oil_model_artifacts.json";
const NEWS_SENTIMENT_HISTORY_RAW_URL =
  "https://raw.githubusercontent.com/iAi2025Joy/gold-predictor/main/oil_news_sentiment_history.json";

// Same reasoning as gold's fetchFreshestNewsSentiment: free (a GitHub
// file fetch, not a paid API call), so always attempted. Reads oil's
// OWN separate sentiment file (see news_sentiment_fetcher.py's oil
// keyword pass), not gold's.
async function fetchFreshestNewsSentiment() {
  try {
    const resp = await fetch(NEWS_SENTIMENT_HISTORY_RAW_URL, { cache: "no-store" });
    if (!resp.ok) return null;
    const records = await resp.json();
    if (!Array.isArray(records) || records.length === 0) return null;

    const withScores = records.filter(
      (r) => r.avg_sentiment_score !== null && r.avg_sentiment_score !== undefined && r.timestamp
    );
    if (withScores.length === 0) return null;

    const latest = withScores.reduce((a, b) => (new Date(a.timestamp) > new Date(b.timestamp) ? a : b));
    return latest.avg_sentiment_score;
  } catch (err) {
    return null;
  }
}

// ------------------------------------------------------------------
// Feature reconstruction -- the rolling-mean/rolling-std/RSI formulas
// are IDENTICAL to gold's (confirmed by direct comparison of both
// Python add_features() functions), reused verbatim. Only pctChange
// differs, since oil clips its return features and gold does not.
// ------------------------------------------------------------------

// Oil-specific: matches pandas' df[col].clip(lower=-2.0, upper=2.0) in
// oil_predictor_updater.py's add_features() exactly -- verified
// numerically identical to pandas' own clip() before this was written.
// Guards against the same class of distortion documented there (e.g.
// WTI's real April 2020 negative-price day inverting a pct_change
// calculation's sign) -- in practice this almost never engages for a
// live, current price, but is included for exact fidelity to the
// model's actual trained preprocessing, not just what's "usually" fine.
const RETURN_CLIP = 2.0;
function clipReturn(x) {
  return Math.max(-RETURN_CLIP, Math.min(RETURN_CLIP, x));
}

function pctChange(prices, n) {
  const last = prices[prices.length - 1];
  const nAgo = prices[prices.length - 1 - n];
  return clipReturn((last - nAgo) / nAgo);
}

function rollingMean(arr, window) {
  const slice = arr.slice(arr.length - window);
  return slice.reduce((a, b) => a + b, 0) / window;
}

// pandas' .std() defaults to SAMPLE std (ddof=1), not population std.
function rollingStdSample(arr, window) {
  const slice = arr.slice(arr.length - window);
  const mean = slice.reduce((a, b) => a + b, 0) / window;
  const sumSqDiff = slice.reduce((a, b) => a + (b - mean) ** 2, 0);
  return Math.sqrt(sumSqDiff / (window - 1));
}

// NOTE: oil's wti_vol10 is computed from the CLIPPED 1-day return
// series (df["wti_ret_1d"].rolling(10).std(), where wti_ret_1d is
// already clipped) -- so the daily-return series fed into this must
// itself be built with the same clipping, not raw pct-change.
function computeClippedDailyReturns(prices) {
  const returns = [];
  for (let i = 1; i < prices.length; i++) {
    returns.push(clipReturn((prices[i] - prices[i - 1]) / prices[i - 1]));
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
// least 21 prior prices (for the 20-day moving average).
function computePriceDerivedFeatures(recentPrices, livePrice) {
  const prices = [...recentPrices, livePrice];
  if (prices.length < 21) return null;

  const allClippedReturns = computeClippedDailyReturns(prices);
  return {
    wti_ret_1d: pctChange(prices, 1),
    wti_ret_3d: prices.length > 3 ? pctChange(prices, 3) : null,
    wti_ret_5d: prices.length > 5 ? pctChange(prices, 5) : null,
    wti_ma_ratio: rollingMean(prices, 5) / rollingMean(prices, 20),
    wti_vol10: rollingStdSample(allClippedReturns, 10),
    rsi14: computeRSI(prices, 14),
  };
}

// ------------------------------------------------------------------
// Model inference -- IDENTICAL math to gold's (same sklearn model
// classes: LogisticRegression, LinearRegression, GradientBoosting*),
// reused verbatim.
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

function runDirectionInference(model, xScaled) {
  if (model.type === "logistic_regression") {
    const z = xScaled.reduce((sum, xi, i) => sum + xi * model.coef[i], model.intercept);
    return sigmoid(z);
  }
  let raw = model.init_log_odds;
  for (const tree of model.trees) {
    raw += model.learning_rate * traverseTree(tree, xScaled);
  }
  return sigmoid(raw);
}

function runPriceInference(model, xScaled) {
  if (model.type === "linear_regression") {
    return xScaled.reduce((sum, xi, i) => sum + xi * model.coef[i], model.intercept);
  }
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

export async function runLiveOilInference(livePrice, cachedData) {
  let history, artifacts, freshestSentiment;
  try {
    const [historyResp, artifactsResp, sentimentResult] = await Promise.all([
      fetch(PRICE_HISTORY_RAW_URL, { cache: "no-store" }),
      fetch(MODEL_ARTIFACTS_RAW_URL, { cache: "no-store" }),
      fetchFreshestNewsSentiment(),
    ]);
    if (!historyResp.ok || !artifactsResp.ok) return null;
    history = await historyResp.json();
    artifacts = await artifactsResp.json();
    freshestSentiment = sentimentResult;
  } catch (err) {
    return null;
  }

  if (!Array.isArray(history) || history.length < 21) return null;

  // Sort by date ascending -- matches the order the Python pipeline
  // processes them in. Oil's saved history uses the "WTI" column name
  // (not "GLD").
  const sorted = [...history].sort((a, b) => new Date(a.Date) - new Date(b.Date));
  const recentPrices = sorted.slice(-60).map((row) => row.WTI);

  const priceFeatures = computePriceDerivedFeatures(recentPrices, livePrice);
  if (!priceFeatures) return null;

  const newsSentimentValue = freshestSentiment !== null ? freshestSentiment : cachedData.latest_news_sentiment_score;
  const newsSentimentAvailable = freshestSentiment !== null || cachedData.news_sentiment_currently_available;

  const featureOrder = artifacts.scaler.feature_order;
  const rawValues = featureOrder.map((name) => {
    if (name in priceFeatures) return priceFeatures[name];
    // Non-price-derived features: use whatever the cached daily
    // prediction already carries -- except news sentiment, refreshed
    // above since doing so costs nothing. Field names here match what
    // oil_predictor_updater.py now exposes (latest_real_yield_10y_pct/
    // latest_dxy/latest_vix -- added specifically to support this live
    // inference path, since they were previously computed as model
    // inputs but never surfaced in the output JSON).
    const cachedFieldMap = {
      news_sentiment: newsSentimentValue,
      news_sentiment_available: newsSentimentAvailable ? 1 : 0,
      real_yield_10y: cachedData.latest_real_yield_10y_pct,
      dxy: cachedData.latest_dxy,
      vix: cachedData.latest_vix,
      macro_data_available: cachedData.macro_data_currently_available ? 1 : 0,
      fed_funds_midpoint: cachedData.current_fed_funds_midpoint_pct,
      yield_fed_spread: cachedData.yield_minus_fed_funds_spread_pct,
      fed_rate_data_available: cachedData.fed_rate_data_currently_available ? 1 : 0,
      oil_implied_vol: cachedData.latest_oil_implied_volatility_pct,
      implied_vol_data_available: cachedData.implied_vol_data_currently_available ? 1 : 0,
      hours_to_next_event: cachedData.hours_until_next_economic_event,
      in_event_window_48h: cachedData.in_high_impact_event_window_48h ? 1 : 0,
    };
    return cachedFieldMap[name] ?? 0;
  });

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
