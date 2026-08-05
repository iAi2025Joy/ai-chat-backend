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
//
// FRESH-PRICE-ON-REQUEST (added later): the underlying model itself
// (training, backtesting, significance testing) still only runs hourly
// via GitHub Actions -- deliberately NOT re-run on every chat question,
// since that takes 10-30+ seconds and would make every prediction
// question feel slow for no real statistical benefit (nothing about the
// model's trained behavior meaningfully changes within an hour). BUT the
// specific PRICE NUMBERS shown to the user (current price, and the
// predicted price derived from it) ARE refreshed live at the moment of
// the question -- see fetchFreshPriceData() below. This gives an
// always-current price without the cost/latency of full retraining.

import { fetchLiveGoldPrice } from "./liveGoldPrice.js";
import { runLiveGoldInference } from "./goldLiveInference.js";

// ------------------------------------------------------------------
// MARKET HOURS -- CORRECTED (a real, confirmed factual error this
// fixes): a prior version of this treated gold as only trading during
// GLD's own ETF hours (NYSE Arca, 9:30 AM - 4:00 PM ET, weekdays only)
// -- but that's the wrong reference market. Gold's actual global
// spot/forex market (XAU/USD), which is what genuinely drives live
// price movement, trades nearly continuously through the week: opens
// Sunday 6:00 PM ET and runs through Friday 5:00 PM ET, with the ONLY
// real closure being the weekend gap (Friday 5:00 PM ET through Sunday
// 6:00 PM ET). This is now checked against that correct weekly window,
// not a narrower daily one. NOTE: still does not account for the rare
// holiday closure -- a real, acknowledged simplification.
// ------------------------------------------------------------------

function isGoldMarketOpenAt(checkDate) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(checkDate);

  const weekdayNames = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dayIndex = weekdayNames[parts.find((p) => p.type === "weekday").value];
  // % 24 normalizes a real Intl/ICU quirk: with hour12:false, the
  // "en-US" locale can format the midnight hour as "24" instead of "0"
  // (an artifact of deriving 24-hour formatting from 12-hour rules
  // internally) -- without this, isGoldMarketOpenAt could incorrectly
  // report the market as OPEN during the 00:00-00:59 ET hour
  // specifically. Applied as a safe precaution alongside the actual
  // confirmed fix below (the server-side market_closed_statement
  // guarantee in server.js) -- both together have been confirmed
  // working correctly in production testing since.
  const hour = parseInt(parts.find((p) => p.type === "hour").value, 10) % 24;
  const minute = parseInt(parts.find((p) => p.type === "minute").value, 10);

  const minutesSinceSundayMidnightET = dayIndex * 1440 + hour * 60 + minute;
  const weeklyOpenMinute = 0 * 1440 + 18 * 60; // Sunday 6:00 PM ET
  const weeklyCloseMinute = 5 * 1440 + 17 * 60; // Friday 5:00 PM ET

  return minutesSinceSundayMidnightET >= weeklyOpenMinute && minutesSinceSundayMidnightET < weeklyCloseMinute;
}

// Finds the exact moment the market next opens, by stepping forward in
// 5-minute increments until isGoldMarketOpenAt() flips true. Avoids any
// manual timezone/DST arithmetic entirely -- correctness only depends
// on isGoldMarketOpenAt() itself, which is simple to verify directly.
// The search space is at most ~2.5 days (the longest possible closure,
// Friday 5 PM ET to Sunday 6 PM ET) = well under 1000 cheap steps.
function findNextGoldMarketOpen(fromDate) {
  let candidate = new Date(fromDate);
  for (let i = 0; i < 1000; i++) {
    if (isGoldMarketOpenAt(candidate)) return candidate;
    candidate = new Date(candidate.getTime() + 5 * 60 * 1000);
  }
  return null; // should be unreachable given the max ~2.5-day closure window, but never throw over this
}

function getGoldMarketStatus(nowUtc, safeTimezone) {
  const isOpen = isGoldMarketOpenAt(nowUtc);
  let nextOpenAt = null;
  let formattedNextOpenAt = null;

  if (!isOpen) {
    nextOpenAt = findNextGoldMarketOpen(nowUtc);
    if (nextOpenAt) {
      formattedNextOpenAt = nextOpenAt.toLocaleString(undefined, {
        weekday: "long", year: "numeric", month: "short", day: "numeric",
        hour: "2-digit", minute: "2-digit", timeZoneName: "short",
        timeZone: safeTimezone,
      });
    }
  }

  return { isOpen, nextOpenAt, formattedNextOpenAt };
}


const GOLD_PREDICTION_RAW_URL =
  "https://raw.githubusercontent.com/iAi2025Joy/gold-predictor/main/gold_prediction_latest.json";

// THREE-LAYER FALLBACK, each strictly better than the next when available:
//  1. Full model inference: the live price genuinely flows through the
//     actual trained model's real math (recomputed technical features +
//     real logistic/linear/gradient-boosting inference) -- see
//     goldLiveInference.js. This is the real thing, not an approximation.
//  2. Percentage scaling: if full inference isn't available (e.g. the
//     model artifacts file is missing, or there's not enough recent
//     price history), apply the model's already-decided predicted
//     PERCENTAGE change to the live price -- still live-price-aware,
//     just not re-derived from the model's actual feature-based logic.
//  3. Fully cached: if even the live price fetch itself fails, fall back
//     to the hourly job's cached snapshot. A prediction should never
//     break just because one extra live call had a hiccup.
async function fetchFreshPriceData(cachedData) {
  let livePrice;
  try {
    const live = await fetchLiveGoldPrice();
    livePrice = live.price;
  } catch (err) {
    return {
      currentPriceUsd: cachedData.current_price_usd ?? null,
      predictedPriceUsd: cachedData.predicted_price_usd ?? null,
      priceDirectionVsCurrent: cachedData.price_direction_vs_current ?? null,
      directionPriceAgreement: cachedData.direction_price_agreement ?? null,
      livePriceUsed: false,
      livePriceFetchedAt: null,
      liveInferenceUsed: false,
    };
  }

  // Layer 1: try genuine full model inference first.
  if (cachedData.prediction === "up" || cachedData.prediction === "down") {
    const fullInference = await runLiveGoldInference(livePrice, cachedData);
    if (fullInference) {
      const predictedPriceUsd = fullInference.predictedPriceUsd;
      let priceDirectionVsCurrent;
      if (predictedPriceUsd > livePrice) priceDirectionVsCurrent = "higher";
      else if (predictedPriceUsd < livePrice) priceDirectionVsCurrent = "lower";
      else priceDirectionVsCurrent = "the same";

      return {
        currentPriceUsd: livePrice,
        predictedPriceUsd,
        priceDirectionVsCurrent,
        // Direction and price now come from the SAME live-price-based
        // inference, so they're compared against each other, not
        // against the (possibly different) hourly cached direction.
        directionPriceAgreement:
          (fullInference.prediction === "up" && predictedPriceUsd >= livePrice) ||
          (fullInference.prediction === "down" && predictedPriceUsd <= livePrice),
        livePriceUsed: true,
        livePriceFetchedAt: new Date().toISOString(),
        liveInferenceUsed: true,
        // The direction call itself may have flipped from the cached
        // hourly one, now that it's based on a genuinely live price --
        // surface this explicitly rather than silently overriding it.
        liveInferenceDirection: fullInference.prediction,
        liveInferenceProbabilityUp: fullInference.predictionProbabilityUp,
      };
    }
  }

  // Layer 2: percentage-scaling fallback.
  const cachedCurrent = cachedData.current_price_usd;
  const cachedPredicted = cachedData.predicted_price_usd;
  let predictedPriceUsd = cachedPredicted; // fallback if we can't recompute (e.g. insufficient_data, no cached prediction yet)

  if (cachedCurrent && cachedPredicted && cachedCurrent !== 0) {
    const predictedReturnPct = (cachedPredicted - cachedCurrent) / cachedCurrent;
    predictedPriceUsd = livePrice * (1 + predictedReturnPct);
  }

  let priceDirectionVsCurrent = null;
  let directionPriceAgreement = null;
  if (predictedPriceUsd !== null && predictedPriceUsd !== undefined) {
    if (predictedPriceUsd > livePrice) priceDirectionVsCurrent = "higher";
    else if (predictedPriceUsd < livePrice) priceDirectionVsCurrent = "lower";
    else priceDirectionVsCurrent = "the same";

    directionPriceAgreement =
      (cachedData.prediction === "up" && predictedPriceUsd >= livePrice) ||
      (cachedData.prediction === "down" && predictedPriceUsd <= livePrice);
  }

  return {
    currentPriceUsd: livePrice,
    predictedPriceUsd,
    priceDirectionVsCurrent,
    directionPriceAgreement,
    livePriceUsed: true,
    livePriceFetchedAt: new Date().toISOString(),
    liveInferenceUsed: false,
  };
}

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
        "Get a statistical PREDICTION/forecast for gold's NEXT HOURLY data point (direction and forecasted price) -- NOT a full day or 'tomorrow's' forecast; the underlying model is trained to predict the next hourly price update specifically (gold's price history is fetched once per hour, and the model's target is literally the very next row in that hourly series). The MODEL ITSELF (its trained behavior, backtested accuracy, statistical significance) is only retrained hourly -- but the CURRENT PRICE this returns is fetched fresh, live, at the exact moment this tool is called, and the predicted price is recalculated against that live price (see live_price_used/live_price_fetched_at in the response). Use this when the user wants a prediction, forecast, or direction (up/down), or asks about the prediction system's methodology/data sources -- this is now also the right tool for a simple 'what's the gold price right now' question, since the price returned is genuinely live, not a stale cached snapshot. Also use this whenever the user asks about the gold prediction system's methodology, data sources, historical data range, number of data points, whether it uses news, or asks you to prove/verify/explain what data or method the gold prediction is based on -- never answer such questions from general knowledge or guesswork.",
      parameters: {
        type: "object",
        properties: {},
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

export async function handleGoldPredictionCall(argsJson, userTimezone) {
  // NOTE: argsJson is no longer used for anything meaningful -- this
  // tool used to accept a "horizon" parameter (next_hour/next_day) that
  // GPT could pass, but it never actually changed the underlying
  // prediction (which is ALWAYS the next hourly data point, mechanically,
  // regardless of what horizon was "requested"). That was a real,
  // confirmed source of confusion -- GPT sometimes said "next day" while
  // the actual math was predicting the next hour. Removed the fake
  // choice entirely rather than patch around it; argsJson is accepted
  // here only so the function signature doesn't break if a stale tool
  // schema is still cached somewhere.

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

  // Format in the VISITOR'S OWN local timezone (sent by the browser via
  // Intl.DateTimeFormat().resolvedOptions().timeZone), not the server's --
  // this backend runs on a server in UTC, which is not where the person
  // asking actually is. Falls back to UTC if the browser didn't send one
  // (e.g. an older cached page) or sent something invalid -- validated by
  // actually trying it in a throwaway formatter first, since passing an
  // invalid IANA zone name to toLocaleString throws.
  let safeTimezone = "UTC";
  if (userTimezone) {
    try {
      new Intl.DateTimeFormat(undefined, { timeZone: userTimezone });
      safeTimezone = userTimezone;
    } catch {
      // invalid zone string -- keep the UTC fallback
    }
  }

  // Skip the live-price refresh entirely if there's no real prediction to
  // apply it to yet (insufficient_data) -- nothing meaningful to recompute.
  const freshPrice = data.prediction === "up" || data.prediction === "down"
    ? await fetchFreshPriceData(data)
    : {
        currentPriceUsd: data.current_price_usd ?? null,
        predictedPriceUsd: data.predicted_price_usd ?? null,
        priceDirectionVsCurrent: data.price_direction_vs_current ?? null,
        directionPriceAgreement: data.direction_price_agreement ?? null,
        livePriceUsed: false,
        livePriceFetchedAt: null,
      };

  const marketStatus = getGoldMarketStatus(new Date(), safeTimezone);

  const updatedAt = data.updated_at ? new Date(data.updated_at) : null;
  const formattedUpdatedAt = updatedAt && !isNaN(updatedAt.getTime())
    ? updatedAt.toLocaleString(undefined, {
        year: "numeric", month: "short", day: "numeric",
        hour: "2-digit", minute: "2-digit", timeZoneName: "short",
        timeZone: safeTimezone,
      })
    : null;
  const ageMinutes = updatedAt ? Math.round((Date.now() - updatedAt.getTime()) / 60000) : null;
  let staleWarning = null;
  if (ageMinutes !== null && ageMinutes > 180) {
    staleWarning = `Warning: the underlying MODEL (its training/backtest stats) was last updated ${ageMinutes} minutes ago and may be stale -- say so explicitly to the user. (This does not apply to the price itself, which is fetched fresh live when live_price_used is true.)`;
  }

  const livePriceFetchedAtDate = freshPrice.livePriceFetchedAt ? new Date(freshPrice.livePriceFetchedAt) : null;
  const formattedLivePriceFetchedAt = livePriceFetchedAtDate
    ? livePriceFetchedAtDate.toLocaleString(undefined, {
        year: "numeric", month: "short", day: "numeric",
        hour: "2-digit", minute: "2-digit", second: "2-digit", timeZoneName: "short",
        timeZone: safeTimezone,
      })
    : null;

  const response = {
    prediction: freshPrice.liveInferenceUsed ? freshPrice.liveInferenceDirection : (data.prediction ?? null),
    prediction_probability_up: freshPrice.liveInferenceUsed ? freshPrice.liveInferenceProbabilityUp : (data.prediction_probability_up ?? null),
    cached_hourly_direction: data.prediction ?? null,
    confidence_note: data.confidence_note ?? null,
    model_type_used: data.model_type_used ?? null,
    current_price_usd: freshPrice.currentPriceUsd,
    predicted_price_usd: freshPrice.predictedPriceUsd,
    price_model_type_used: data.price_model_type_used ?? null,
    price_direction_vs_current: freshPrice.priceDirectionVsCurrent,
    direction_price_agreement: freshPrice.directionPriceAgreement,
    live_price_used: freshPrice.livePriceUsed,
    live_inference_used: freshPrice.liveInferenceUsed,
    gold_market_open: marketStatus.isOpen,
    // Pre-written, ready-to-use strings for the closed-market case --
    // GPT is instructed to insert these VERBATIM rather than compose its
    // own phrasing. This exists because prose instructions asking GPT to
    // compose the right wording each time failed repeatedly and
    // persistently in production (confirmed real, multiple times) --
    // shifting the exact wording into server-computed data, the same
    // reliable pattern already used for timestamps, is far more robust
    // than trusting compositional instruction-following for this.
    market_closed_statement: marketStatus.isOpen ? null : "Gold markets are currently closed.",
    price_label: marketStatus.isOpen ? "Current Price" : "Last Price Recorded Before Markets Closed",
    predicted_price_label: marketStatus.isOpen ? "Predicted Price (Next Hourly Update)" : "Expected Price When Markets Reopen",
    market_reopens_note: marketStatus.formattedNextOpenAt,
    live_price_fetched_at: freshPrice.livePriceFetchedAt,
    formatted_live_price_fetched_at: formattedLivePriceFetchedAt,
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
    model_last_trained_at: data.updated_at ?? null,
    formatted_model_last_trained_at: formattedUpdatedAt,
    model_training_age_minutes: ageMinutes,
    stale_warning: staleWarning,
    important_context_for_the_model:
      "This is a statistical estimate from a backtested model, NOT financial advice. MARKET HOURS -- READ THIS CAREFULLY, a repeatedly-failed instruction this fixes differently: gold trades essentially 24 hours a day from Sunday 6:00 PM ET through Friday 5:00 PM ET, closed only during the weekend gap. Composing the right closed-market phrasing yourself has failed multiple times in production, including subtle workarounds like writing 'as of now... the last price was $X' (still misleading, since pairing any present-moment phrase with the price recreates the same false impression even while technically avoiding the literally banned words). So: DO NOT compose your own phrasing for this -- use price_label and predicted_price_label EXACTLY AS GIVEN, verbatim, as the literal labels for current_price_usd and predicted_price_usd (e.g. write '**Last Price Recorded Before Markets Closed:** $4,043.21', copying price_label's exact text as the label, when gold_market_open is false -- these two fields already say the correct thing for the current market status, so copying them removes the need to get the phrasing right yourself). If market_closed_statement is non-null, it MUST be the very first sentence of your response, stated exactly as given, verbatim, with nothing else before it. If market_closed_statement is null (market is open), write normally with no special statement needed. Also mention market_reopens_note when present (already formatted in the user's own local timezone -- state it exactly as given, do not reformat or convert it yourself). Apply price_label/predicted_price_label consistently at EVERY mention throughout your entire response, including any summary/recap/bullet section -- not just the first mention. Still apply all the same significance/best-guess/disagreement caveats below exactly as normal regardless of market status. " +
      "IMPORTANT: when live_inference_used is true, this is a GENUINE re-run of the actual trained model (the real math -- not an approximation) against a live price fetched at this exact moment, so 'prediction' and 'prediction_probability_up' reflect what the model ACTUALLY says right now, given real current data -- this can occasionally differ from cached_hourly_direction (what the model said an hour ago), since the live price is genuinely new information; if they differ, say so plainly (e.g. 'the model's live read right now is actually up, a change from its cached hourly call of down, since the price has moved since then') rather than treating this as a bug. When live_inference_used is false (a rarer fallback case -- e.g. not enough recent price history, or the model artifacts weren't available), 'prediction' falls back to the cached hourly direction, and you should mention the price shown is still live even though the direction call itself is from the last hourly run. " +
      "NEAR-COIN-FLIP FRAMING (a confirmed real gap this is fixing -- a prior response led with a confident-sounding 'downward trend' headline when the actual probability was 49.19%, essentially a toss-up): if prediction_probability_up is between about 45% and 55%, do NOT lead with a confident-sounding directional headline like 'indicates a downward/upward trend'. Instead, lead by saying plainly that the model's read is very close to a coin flip today, and state both percentages (e.g. 'the model's call today is almost a coin flip -- 49.19% chance up, 50.81% chance down'), before mentioning which side technically wins. Only use confident directional framing when the probability is meaningfully away from 50% (roughly beyond the 45-55% band). " +
      "ALWAYS state the current_price_usd value explicitly, AND ALWAYS include the exact date/time from formatted_live_price_fetched_at right alongside it when live_price_used is true -- e.g. say 'as of right now (July 29, 2026 at 2:51:03 AM UTC), gold is at $X,XXX per ounce' -- this is a live figure, so it is fine and accurate to say 'right now' or 'currently', unlike before (but see MARKET HOURS AWARENESS above -- do not say 'right now' when markets are closed, even though the timestamp itself is accurate). If live_price_used is false (the live fetch failed and this fell back to the cached snapshot), instead say the price is 'as of the model's last update' using formatted_model_last_trained_at, and be clear it may not be perfectly current. Separately, formatted_model_last_trained_at tells you when the underlying MODEL's TRAINED PARAMETERS (its coefficients/trees, backtested accuracy, statistical significance) were last computed -- this updates hourly regardless of live_inference_used, since retraining itself is deliberately not repeated on every question (it takes 10-30+ seconds); if asked how current the model's own training is (as opposed to today's prediction), use this field and model_training_age_minutes instead. predicted_price_usd is derived from the live price either way (via genuine feature-based inference when live_inference_used is true, or via percentage-scaling of the cached forecast otherwise), so it reflects the live price, not a stale one. If predicted_price_usd is present, state it as the model's forecast for the NEXT HOURLY update specifically when markets are open (e.g. 'the model's forecast for the next hourly update is approximately $X,XXX' -- NEVER say 'next day', 'tomorrow', or 'next period' without specifying hourly, since this is a confirmed real source of past confusion) -- but if is_price_prediction_significant is false, explicitly say this dollar figure was NOT shown to be more accurate than assuming the price stays the same, and label the price itself with the exact bracketed tag '(Model Best Guess)' right after the number (e.g. '$4,020.98 (Model Best Guess)') -- ALWAYS use this exact phrase '(Model Best Guess)' for this, NEVER say '(not reliable)' or any other wording for this label, even though the underlying meaning is the same -- this exact phrasing is a deliberate, requested standard, not optional. CRITICAL CONSISTENCY RULE (a confirmed real bug this is fixing): the 'prediction' field (up/down) and predicted_price_usd come from two SEPARATE, independent models -- a direction classifier and a price regression -- and they do NOT always agree with each other, this is a real and expected limitation, not an error. NEVER describe the price forecast as an 'increase' or 'higher' or 'decrease'/'lower' based on the 'prediction' field or your own mental comparison of the two dollar figures -- ALWAYS use the exact word given in price_direction_vs_current ('higher', 'lower', or 'the same') to describe how predicted_price_usd compares to current_price_usd, since that field is computed directly and deterministically and is guaranteed correct, unlike inferring it yourself. If direction_price_agreement is false, you MUST explicitly tell the user the two parts of the model disagree right now (e.g. 'note: the model's direction call and its specific price estimate don't fully agree with each other today, which happens sometimes and is worth treating as an extra reason for caution') -- do not silently paper over the disagreement or pick whichever framing sounds more confident. If the user asks what algorithm or type of model is being used, or whether it's a 'simple' model or something more advanced like machine learning, use model_type_used/price_model_type_used -- these tell you EXACTLY which of two candidate models was actually selected for this run (either 'logistic_regression'/'linear_regression', the simpler baseline models, or 'gradient_boosting', a more complex model) based on real, measured performance on held-out test data, not a fixed choice -- explain that the system tries both every run and picks whichever genuinely performs better, so which one is 'in use' can change over time as more data comes in. Do not claim a fixed algorithm is always used if these fields say otherwise. If the user asks what data this is based on, what history it uses, whether it uses news, whether it factors in interest rates/the dollar/market volatility, or asks you to prove/verify its data sources, answer using the real fields provided: historical_data_start_date/historical_data_end_date (the actual real date range of price history used), data_points_used (the real count), latest_news_sentiment_score/news_sentiment_currently_available (whether a real, gold-relevant news sentiment reading is currently feeding the model, and its value if so), and latest_real_yield_10y_pct/latest_dxy/latest_vix/macro_data_currently_available (the model's most recent real-yield, dollar-index, and VIX readings, which ARE used as model inputs alongside gold's own price action -- these are DAILY-resolution figures from FRED, not intraday, so mention that if the user asks how fresh they are). Note that news sentiment, macro/Fed-rate data, implied volatility, and economic-calendar proximity are NOT recomputed live even when live_inference_used is true -- only the 6 price-derived technical features (returns, moving-average ratio, volatility, RSI) are; the others come from the last hourly run regardless, since their own underlying sources only update on their own daily/6-hourly schedules anyway. If news_sentiment_currently_available or macro_data_currently_available is false, say plainly that the relevant data wasn't available in the most recent check, which is a normal and expected outcome, not a malfunction. If the user asks whether gold's own model factors in interest rates, mention current_fed_funds_midpoint_pct and yield_minus_fed_funds_spread_pct as real inputs used by this gold model -- but if the user wants the FULL Fed rate picture (current target range, the Fed's own published outlook, or market rate expectations), tell them you can get that and call get_dxy_prediction instead, since that tool owns the complete, authoritative version of Fed rate data -- do not try to answer the full Fed rate picture using only gold's two limited fields. If the user asks whether this system learns from its past predictions, improves over time, or how accurate it's been LATELY (as opposed to the historical backtest), use rolling_predictions_tracked/rolling_direction_accuracy/rolling_price_mae_usd/rolling_accuracy_is_significant/rolling_accuracy_note -- this is a SEPARATE, live-updating scorecard the system keeps by checking each of its own real past predictions against what actually happened next, distinct from model_accuracy_vs_baseline (which is a one-time historical backtest done at training time). Explain clearly that recency_weighting_half_life_days means recent price data is weighted more heavily than old data when the model retrains (so it adapts somewhat to changing conditions), but this does NOT mean the model changes its past predictions retroactively or does true online learning -- it retrains fresh each run, just with recent data counting more. Do not overstate this as more sophisticated 'self-learning AI' than it actually is. If the user asks about upcoming economic events, whether volatility is expected soon, or when the next Fed decision/CPI/jobs report is, use next_economic_event_name/hours_until_next_economic_event/in_high_impact_event_window_48h -- this comes from a hand-maintained real calendar of known FOMC/CPI/Non-Farm-Payrolls dates (publicly announced by the Fed/BLS well in advance), NOT a prediction of which direction that event will move gold -- be clear this only flags WHEN volatility is more likely, never WHICH WAY gold will move because of it. If economic_calendar_needs_update is true, say plainly that the calendar's known event dates have run out and don't state a next-event date at all -- do not guess or make one up. Do not guess or generalize about the data sources -- use only these real fields. CRITICAL: this tool provides exactly ONE forecast value, for the single immediate next period only -- it does NOT provide a multi-day, weekly, or day-by-day forecast, and does NOT provide a weekly or monthly average forecast either (the underlying historical data mixes two different time resolutions, so a genuine calendar-based week/month-ahead forecast is not currently supported by the underlying math -- this is a real technical limitation, not a policy choice). If the user asks for prices across multiple future days (e.g. 'the next 7 days'), a week-ahead average, or a month-ahead average, you MUST NOT repeat, average, or extrapolate this single value to simulate one -- that would misrepresent what the system actually supports. Instead, respond professionally and plainly: apologize that a week-ahead or month-ahead forecast isn't available with the current model, briefly note it would need the underlying data to be restructured onto a consistent time grid first, and then offer the single next-period estimate as what IS available right now. If prediction is 'insufficient_data', tell the user the system is still gathering enough real price history to make a prediction, and give no direction or price forecast. If is_statistically_significant is false, tell the user plainly that no reliable directional edge was detected rather than stating a confident direction (this significance figure describes the MODEL's general backtested quality and remains valid regardless of live_inference_used, since it's the same trained model either way -- only the input data point is fresher). Always mention this is not financial advice. If the user asks whether gold's prediction is consistent with the dollar's prediction, or asks for a sanity check / second opinion, use cross_asset_consistency_with_dollar and cross_asset_consistency_note -- this compares gold's direction call against the Dollar Index model's own latest direction call (gold and the dollar are usually inversely related, so pointing opposite ways is the expected/reassuring case, and pointing the SAME way is a plausibility flag worth mentioning as extra caution, not proof either model is wrong). If cross_asset_consistency_with_dollar is 'not_available', say plainly that there's no DXY prediction to compare against right now (e.g. it may still be in its own data ramp-up period) rather than guessing. Mention dxy_data_age_hours if asked how current that comparison is, since gold updates hourly but DXY only every 6 hours. If the user asks about a RANGE of likely prices, expected volatility, how much gold might move, or wants a probabilistic range instead of a single point forecast, use implied_volatility_expected_range -- this is REAL, market-derived data (CBOE's Gold ETF Volatility Index, computed from actual GLD options market prices, same methodology as VIX), giving implied_price_range_low/high as a genuine expected range. CRITICAL: this range describes HOW FAR price might move, NOT WHICH DIRECTION -- it is completely separate information from the direction/price prediction fields above (which are this system's own model outputs), and must never be presented as if it agrees or disagrees with the direction call, since IV says nothing about direction. Always mention it's roughly a one-standard-deviation range (about 68% likelihood), not a guarantee. If implied_vol_data_currently_available is false, say plainly that this data wasn't available in the most recent check.",
  };

  return JSON.stringify(response);
}
