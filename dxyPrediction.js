// dxyPrediction.js
// ====================
//
// Adds a "get_dxy_prediction" function your GPT-powered chatbot can call
// when a user asks about the US Dollar Index / dollar strength direction.
//
// ARCHITECTURE: same as goldPrediction.js -- reads the prediction JSON
// straight from the gold-predictor GitHub repo's raw content URL, which
// dxy_predictor_updater.py commits there every 6 hours via GitHub
// Actions. No separate backend storage, no shared secret.
//
// IMPORTANT: this tracks DTWEXBGS (FRED's Trade-Weighted Broad Dollar
// Index), a real, free, reputable dollar-strength benchmark -- NOT the
// exact same series as the licensed ICE "DXY" futures ticker some
// trading platforms show (that's a different, paid data product this
// project has no legal free access to). The two move very closely
// together, but the model always answers as "the Dollar Index" and
// includes data_source_note, never claiming to be the literal ICE DXY.

const DXY_PREDICTION_RAW_URL =
  "https://raw.githubusercontent.com/iAi2025Joy/gold-predictor/main/dxy_prediction_latest.json";

export function getDxyPredictionToolDefinition() {
  return {
    type: "function",
    function: {
      name: "get_dxy_prediction",
      description:
        "Get a statistical PREDICTION/forecast for the US Dollar Index (DTWEXBGS, a free/public Trade-Weighted Broad Dollar Index -- NOT the identical licensed ICE 'DXY' futures ticker, though closely correlated) for its next update period, based on the system's own model -- along with the index's own snapshot value at the model's last update. Use this when the user asks about the dollar's direction/strength/forecast, or 'DXY prediction'. ALSO use this ANY TIME the user asks about the CURRENT Federal Reserve / Fed interest rate, Fed funds rate, or what the Fed is expected to do with rates in the future -- even if the question does NOT mention 'dollar' or 'DXY' at all (e.g. 'what's the current Fed rate', 'what interest rate does the Fed expect', 'will the Fed cut rates'). This tool returns real, live Fed rate data (current_fed_funds_rate_lower_pct/upper_pct and fed_rate_outlook) that is NOT part of your training data and changes over time -- NEVER answer a Fed interest rate question from your own general/training knowledge, since that will be outdated or wrong; always call this tool first. Also use this if asked about this system's dollar-prediction methodology or data sources -- never answer from general knowledge.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  };
}

export async function handleDxyPredictionCall() {
  let data;
  try {
    const resp = await fetch(DXY_PREDICTION_RAW_URL, { cache: "no-store" });
    if (!resp.ok) {
      return JSON.stringify({
        error: `DXY prediction data is not available yet (HTTP ${resp.status}). The prediction updater job may not have run yet.`,
      });
    }
    data = await resp.json();
  } catch (err) {
    return JSON.stringify({ error: "Could not reach DXY prediction data: " + err.message });
  }

  const updatedAt = data.updated_at ? new Date(data.updated_at) : null;
  const ageMinutes = updatedAt ? Math.round((Date.now() - updatedAt.getTime()) / 60000) : null;
  let staleWarning = null;
  if (ageMinutes !== null && ageMinutes > 600) {
    // DXY updates every ~6 hours, not hourly like gold -- so the stale
    // threshold here is deliberately much longer than goldPrediction.js's.
    staleWarning = `Warning: this DXY prediction is ${ageMinutes} minutes old and may be stale. Say so explicitly to the user.`;
  }

  const response = {
    prediction: data.prediction ?? null,
    confidence_note: data.confidence_note ?? null,
    model_type_used: data.model_type_used ?? null,
    current_dxy: data.current_dxy ?? null,
    predicted_dxy: data.predicted_dxy ?? null,
    price_model_type_used: data.price_model_type_used ?? null,
    price_direction_vs_current: data.price_direction_vs_current ?? null,
    direction_price_agreement: data.direction_price_agreement ?? null,
    price_confidence_note: data.price_confidence_note ?? null,
    is_price_prediction_significant: data.is_price_prediction_significant ?? null,
    model_accuracy_vs_baseline: data.model_accuracy_vs_baseline ?? null,
    is_statistically_significant: data.is_statistically_significant ?? null,
    latest_macro_news_sentiment_score: data.latest_macro_news_sentiment_score ?? null,
    latest_real_yield_10y_pct: data.latest_real_yield_10y_pct ?? null,
    latest_vix: data.latest_vix ?? null,
    next_economic_event_name: data.next_economic_event_name ?? null,
    hours_until_next_economic_event: data.hours_until_next_economic_event ?? null,
    in_high_impact_event_window_48h: data.in_high_impact_event_window_48h ?? null,
    economic_calendar_needs_update: data.economic_calendar_needs_update ?? null,
    recency_weighting_half_life_days: data.recency_weighting_half_life_days ?? null,
    rolling_predictions_tracked: data.rolling_predictions_tracked ?? null,
    rolling_direction_accuracy: data.rolling_direction_accuracy ?? null,
    rolling_accuracy_is_significant: data.rolling_accuracy_is_significant ?? null,
    rolling_accuracy_note: data.rolling_accuracy_note ?? null,
    data_source_note: data.data_source_note ?? null,
    current_fed_funds_rate_lower_pct: data.current_fed_funds_rate_lower_pct ?? null,
    current_fed_funds_rate_upper_pct: data.current_fed_funds_rate_upper_pct ?? null,
    fed_rate_outlook: data.fed_rate_outlook ?? null,
    fed_rate_outlook_note: data.fed_rate_outlook_note ?? null,
    historical_data_start_date: data.historical_data_start_date ?? null,
    historical_data_end_date: data.historical_data_end_date ?? null,
    data_points_used: data.data_points_used ?? null,
    updated_at: data.updated_at ?? null,
    data_age_minutes: ageMinutes,
    stale_warning: staleWarning,
    important_context_for_the_model:
      "This is a statistical estimate, NOT financial advice. This model tracks DTWEXBGS (FRED's free Trade-Weighted Broad Dollar Index), NOT the identical licensed ICE 'DXY' futures ticker some trading platforms show -- always call it 'the Dollar Index' and mention this distinction if the user asks specifically about 'DXY' the ticker, using data_source_note. ALWAYS state current_dxy explicitly, labeled as the value AS OF THE MODEL'S LAST UPDATE (which can be up to about 6 hours old, since this updates every 6 hours, not hourly like the gold model -- be clear about this different cadence if asked). If predicted_dxy is present, state it as the model's forecast, but if is_price_prediction_significant is false, say plainly this is just the model's best guess. CRITICAL CONSISTENCY RULE (same fix already applied to gold): the 'prediction' field and predicted_dxy come from two separate models and can disagree -- ALWAYS use price_direction_vs_current ('higher'/'lower'/'the same') verbatim to describe the price forecast's direction, never infer it yourself, and if direction_price_agreement is false, explicitly tell the user the two parts disagree right now. If prediction is 'insufficient_data', explain honestly that macro data collection for this model only recently began and it needs about 1-2 weeks of real history before it can predict -- this is expected, not a malfunction. FEDERAL RESERVE INTEREST RATE INFO (works independently of the DXY forecast above -- available even during insufficient_data): if the user asks about the current Fed interest rate, use current_fed_funds_rate_lower_pct/current_fed_funds_rate_upper_pct together as a range (e.g. 'the Fed's target range is currently 3.50% to 3.75%'), sourced live from FRED. If the user asks about FUTURE Fed rate expectations, use fed_rate_outlook -- but this is CRITICALLY IMPORTANT to frame correctly: fed_rate_outlook.median_fed_funds_rate_projection_pct is the FED'S OWN median projection from their own published Summary of Economic Projections (the 'dot plot'), NOT market-implied odds (like what CME FedWatch shows) -- always say 'the Fed itself projects' or 'according to the Fed's own SEP', NEVER 'the market expects' or 'traders are pricing in', since this system has no access to real market-implied probability data. Mention fed_rate_outlook.sep_release_date so the user knows how current this projection is, and that the SEP is only updated quarterly (next expected: fed_rate_outlook.next_sep_release_expected) -- if today's date is well past next_sep_release_expected, say plainly that this projection may be outdated and hasn't been refreshed yet, rather than presenting it as current. If the user asks about live/recent accuracy, use rolling_predictions_tracked/rolling_direction_accuracy/rolling_accuracy_is_significant/rolling_accuracy_note, distinct from model_accuracy_vs_baseline (the one-time historical backtest). Mention next_economic_event_name/hours_until_next_economic_event if asked about upcoming volatility -- this only flags WHEN volatility is likely, never WHICH DIRECTION. If economic_calendar_needs_update is true, don't state a next-event date. Always mention this is not financial advice.",
  };

  return JSON.stringify(response);
}
