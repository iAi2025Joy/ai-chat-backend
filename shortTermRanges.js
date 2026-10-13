// shortTermRanges.js
// ====================
// Reads short_range_latest.json (written every ~15 minutes by the gold-predictor repo's
// "Update Short-Term Ranges" GitHub Action) and prepares an honest, ready-to-present block of
// calibrated 10 / 20 / 30 / 60-minute price ranges for gold or oil.
//
// WHY RANGES: strict walk-forward studies found NO reliable directional edge for gold or oil at any
// horizon (5 minutes to 20 days), so direction is NOT presented as a forecast. A price RANGE can be
// calibrated -- the number that matters is how often the real price landed inside it (live_coverage).

const SHORT_RANGE_RAW_URL =
  "https://raw.githubusercontent.com/iAi2025Joy/gold-predictor/main/short_range_latest.json";

const HORIZON_KEYS = ["10min", "20min", "30min", "60min"];

export async function fetchShortTermRanges(asset, livePrice = null) {
  try {
    const resp = await fetch(SHORT_RANGE_RAW_URL, { cache: "no-store" });
    if (!resp.ok) return null;
    const file = await resp.json();
    const a = file?.assets?.[asset];
    if (!a) return null;
    const fileAgeMinutes = Math.round((Date.now() - Date.parse(file.updated_at)) / 60000);
    // BASIS FIX: the ranges are built from Yahoo FUTURES prices (GC=F / CL=F), which sit a little above/below
    // the live SPOT price GARNET shows (for gold, futures trade ~$15-30 over spot). To keep the table consistent with
    // the live price, each range is converted to a % move from its own base price and re-applied to the live price.
    const base = a.base_price;
    const factor = (typeof livePrice === "number" && livePrice > 0 && typeof base === "number" && base > 0
      && Math.abs(livePrice / base - 1) < 0.05) ? livePrice / base : 1;
    const adjusted = factor !== 1;
    const ref = (typeof livePrice === "number" && livePrice > 0) ? livePrice : base;
    const ranges = {};
    for (const k of HORIZON_KEYS) {
      const r = a.ranges?.[k];
      if (!r || r.range_low == null) { ranges[k] = { available: false }; continue; }
      const enough = (r.live_n ?? 0) >= 30;
      ranges[k] = {
        available: true,
        range_low: Math.round(r.range_low * factor * 100) / 100,
        range_high: Math.round(r.range_high * factor * 100) / 100,
        downside_level: Math.round(r.range_low * factor * 100) / 100,
        upside_level: Math.round(r.range_high * factor * 100) / 100,
        downside_change_usd: Math.round((r.range_low * factor - ref) * 100) / 100,
        upside_change_usd: Math.round((r.range_high * factor - ref) * 100) / 100,
        downside_change_pct: Math.round(((r.range_low * factor / ref) - 1) * 10000) / 100,
        upside_change_pct: Math.round(((r.range_high * factor / ref) - 1) * 10000) / 100,
        horizon_from_now_minutes: r.horizon_from_now_min,
        spans_minutes_of_movement: r.spans_minutes_of_movement,
        valid_at_utc: r.valid_at,
        chance_higher_pct: typeof r.chance_higher === "number" ? Math.round(r.chance_higher * 100) : null,
        chance_lower_pct: typeof r.chance_lower === "number" ? Math.round(r.chance_lower * 100) : null,
        direction_lean_statement: typeof r.chance_higher === "number"
          ? `About ${Math.round(r.chance_higher * 100)}% higher / ${Math.round(r.chance_lower * 100)}% lower -- no reliable lean (this only reflects how similar recent windows ended; it is not a forecast).`
          : "Direction split not available yet -- no reliable lean.",
        live_hit_rate: enough ? r.live_coverage : null,
        live_ranges_scored: r.live_n ?? 0,
        live_hit_rate_statement: enough
          ? `Live record: ${(r.live_coverage * 100).toFixed(0)}% of the last ${r.live_n} ranges contained the real price (target ${Math.round((file.coverage_target ?? 0.7) * 100)}%).`
          : `Live hit rate not yet reliable (${r.live_n ?? 0} scored so far); back-testing on real 5-minute data gave roughly 66-70%.`,
      };
    }
    const stale = a.status !== "ok" || fileAgeMinutes > 60;
    return {
      status: stale ? "stale_or_market_closed" : "ok",
      stale_note: stale
        ? "Short-term ranges are not current (market closed, data delayed, or the updater has not run recently). Say this plainly and do not present any range as current."
        : null,
      ranges_centred_on_live_price: adjusted,
      live_price_used_for_centring: adjusted ? livePrice : null,
      futures_base_price: a.base_price ?? null,
      base_price_as_of_utc: a.data_as_of ?? null,
      base_price_age_minutes: a.data_age_minutes ?? null,
      ranges_file_age_minutes: fileAgeMinutes,
      coverage_target: file.coverage_target ?? 0.7,
      ranges,
      method_note: file.method_note ?? null,
      data_note: file.data_note ?? null,
    };
  } catch {
    return null;
  }
}

export const SHORT_TERM_RANGE_INSTRUCTION =
  "NEW DEFAULT ANSWER FORMAT FOR ANY GOLD/OIL PREDICTION, FORECAST OR OUTLOOK QUESTION -- READ THIS, HIGHEST PRIORITY, it overrides any older instruction about " +
  "answering with a single predicted price plus one range: (1) state the current price (with its label and time as instructed above); (2) present short_term_ranges " +
  "as a table with one row per horizon -- 10, 20, 30 and 60 minutes -- with these columns: Horizon | If it falls (downside_level and downside_change_usd, e.g. '$4,181.63 (-$7.42)') | " +
  "If it rises (upside_level and upside_change_usd, e.g. '$4,196.24 (+$7.19)') | Chance higher / lower (chance_higher_pct / chance_lower_pct) | Live accuracy (live_hit_rate_statement exactly as given); " +
  "(3) then ONE plain sentence that states the takeaway in simple words, for example: 'Over the next 10 minutes gold is expected to stay between $X and $Y (a 70% range), a move of roughly +/- $Z from the current price -- " +
  "up and down are about equally likely, so there is no reliable lean.' Always state it with the real numbers; (4) one short sentence explaining that each is a calibrated 70% range (the real price is expected inside it about 70% of the time) and allows for the age of the newest price data; " +
  "(5) not financial advice. If the user asks for 'full details', also include the data timing (base_price_as_of_utc), the method_note, and the one-hour range and accuracy facts. If short_term_ranges is null " +
  "or its status is stale_or_market_closed, say so plainly and do not invent ranges. " +
  "NEVER move, shift or re-anchor a range to make it point up or down, and NEVER start a range at the current price to imply a direction: the levels given already start from the live price and are two-sided because " +
  "strict testing found no reliable up/down edge. If the user asks which way price will go, say plainly that direction is no better than a coin flip, and that what the model CAN say is how far price is likely to move. " +
  "DO NOT present predicted_price_usd as 'the prediction' or lead with it: when is_price_prediction_significant is false that single number is only a best guess that was " +
  "not statistically better than assuming no change, so mention it at most as a low-confidence side note, never as the headline. " +
  "DIRECTION HONESTY -- HIGH PRIORITY: if directional_edge_status is 'unproven', NEVER present 'prediction' or 'prediction_probability_up' as a forecast or a probability, and never quote a percentage 'confidence' for direction. " +
  "ACCURACY QUESTIONS: quote only real fields -- live_hit_rate / live_hit_rate_statement for ranges, rolling_direction_accuracy for direction (with rolling_predictions_tracked) -- and be clear which is which.";


// Pre-written, server-guaranteed closing note. GPT was observed skipping the "no reliable lean" explanation under the
// table, which made the "Chance higher / lower" column read like a forecast -- so server.js appends this text in code.
export function buildAnswerFooter(assetName, data, shortTerm) {
  if (!shortTerm || shortTerm.status !== "ok") return null;
  const acc = typeof data?.rolling_direction_accuracy === "number" && data?.rolling_predictions_tracked
    ? ` ${assetName}'s up/down calls have been right ${Math.round(data.rolling_direction_accuracy * 100)}% of the time over the last ${data.rolling_predictions_tracked} calls.`
    : "";
  return (
    "**How to read this:** each row is a calibrated 70% range -- the real price is expected to land between the \"If it falls\" and \"If it rises\" levels about 70% of the time " +
    "(and about 30% of the time outside them). The \"Chance higher / lower\" column only shows how similar recent windows ended; it is **not a forecast**, and there is **no reliable lean** " +
    "-- up and down are about equally likely." + acc + " What the model can estimate is *how far* price may move, not *which way*. This is not financial advice."
  );
}
