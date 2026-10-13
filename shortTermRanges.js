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
        very_likely_low: r.range_low90 != null ? Math.round(r.range_low90 * factor * 100) / 100 : null,
        very_likely_high: r.range_high90 != null ? Math.round(r.range_high90 * factor * 100) / 100 : null,
        very_likely_low_change_usd: r.range_low90 != null ? Math.round((r.range_low90 * factor - ref) * 100) / 100 : null,
        very_likely_high_change_usd: r.range_high90 != null ? Math.round((r.range_high90 * factor - ref) * 100) / 100 : null,
        very_likely_live_hit_rate: (r.live_n90 ?? 0) >= 30 ? r.live_coverage90 : null,
        very_likely_live_scored: r.live_n90 ?? 0,
        chance_higher_pct: typeof r.chance_higher === "number" ? Math.round(r.chance_higher * 100) : null,
        chance_lower_pct: typeof r.chance_lower === "number" ? Math.round(r.chance_lower * 100) : null,
        // Small leans are noise (strict tests found no direction edge), so never show them as a split.
        // One practical number per horizon: the middle of the 70% range.
        expected_price: Math.round(((r.range_low + r.range_high) / 2) * factor * 100) / 100,
        // Direction + chance, shown honestly: it comes from how similar recent windows ended, and strict tests found
        // it is NOT reliable (about a coin flip), so it is always tagged as such.
        direction_word: typeof r.chance_higher === "number" ? (r.chance_higher >= 0.5 ? "Up" : "Down") : null,
        direction_chance_pct: typeof r.chance_higher === "number" ? Math.round(Math.max(r.chance_higher, r.chance_lower) * 100) : null,
        direction_display: typeof r.chance_higher === "number"
          ? `${r.chance_higher >= 0.5 ? "Up" : "Down"} ${Math.round(Math.max(r.chance_higher, r.chance_lower) * 100)}% (${Math.abs(r.chance_higher - 0.5) < 0.08 ? "coin flip" : "weak lean"} -- not reliable)`
          : "about 50% / 50% (no reliable lean)",
        direction_lean_statement: "Up and down are about equally likely -- no reliable lean (direction is not a forecast).",
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
  "NEW DEFAULT ANSWER FORMAT FOR ANY GOLD/OIL PREDICTION, FORECAST OR OUTLOOK QUESTION -- HIGHEST PRIORITY, overrides any older instruction about a single predicted price. " +
  "KEEP IT SHORT AND PRACTICAL, in simple everyday words. Use EXACTLY this layout: " +
  "(1) FIRST LINE, in this form: 'Gold is currently at **$4,181.55** as of **October 13, 2026, 12:00:01 PM GMT+1**. Below are the estimated price ranges for the upcoming hour:' (use the real current price and time as instructed above; 'Oil' for oil). " +
  "(2) A table, one row per horizon (10, 20, 30, 60 minutes) with columns: In | Expected price (expected_price, ONE number) | Direction & chance (direction_display EXACTLY as given, e.g. 'Down 52% (coin flip -- not reliable)') | Likely range, 70% (downside_level - upside_level) | Almost certain range, 90% (very_likely_low - very_likely_high). Plain price levels, no +/- columns. " +
  "(3) A short 'What this means' block of 2-3 plain bullets: the practical size of the move (e.g. 'Over the next 10 minutes gold will most likely stay within about $3 of the current price; over an hour, within about $5.'); " +
  "'Likely range' = about 7 times out of 10, 'almost certain' = about 9 times out of 10; and one bullet containing the exact words 'no reliable lean': 'The up/down chance is close to 50/50 -- no reliable lean -- so treat it as a rough guide, not a promise.' " +
  "(4) One short line: 'Not financial advice.' " +
  "NEVER describe the Up/Down percentage as accuracy, confidence or a 70% success rate, and never present a direction as certain. Do not add live-accuracy columns or long explanations; only if the user asks about accuracy or 'full details' add live_hit_rate_statement / data timing (base_price_as_of_utc) / method_note. " +
  "If short_term_ranges is null or status is stale_or_market_closed, say so plainly and do not invent ranges. " +
  "NEVER shift or re-anchor a range to imply direction. DO NOT headline predicted_price_usd. If directional_edge_status is 'unproven', never present 'prediction' or 'prediction_probability_up' as a forecast or probability. " +
  "ACCURACY QUESTIONS: quote only real fields -- live_hit_rate / live_hit_rate_statement for ranges, rolling_direction_accuracy for direction (with rolling_predictions_tracked) -- and be clear which is which.";


// Pre-written, server-guaranteed closing note. GPT was observed skipping the "no reliable lean" explanation under the
// table, which made the "Chance higher / lower" column read like a forecast -- so server.js appends this text in code.
export function buildAnswerFooter(assetName, data, shortTerm) {
  if (!shortTerm || shortTerm.status !== "ok") return null;
  // Short fallback only -- appended in code when the model forgot to say there is no reliable lean.
  return "**Note:** these are likely trading ranges, not a forecast -- up or down is a coin flip, so there is no reliable lean. Not financial advice.";
}
