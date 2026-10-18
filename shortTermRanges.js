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

const DIRECTION_RECORD_URL =
  "https://raw.githubusercontent.com/iAi2025Joy/gold-predictor/main/direction_live_record.json";

// Live, self-scored up/down record: every 10 minutes an Up/Down call is saved and scored 10 minutes later against the real price.
async function fetchDirectionRecord(asset) {
  try {
    const resp = await fetch(DIRECTION_RECORD_URL, { cache: "no-store" });
    if (!resp.ok) return null;
    const file = await resp.json();
    const a = file?.assets?.[asset];
    if (!a) return null;
    const n = a.n_scored ?? 0;
    // How much of the raw "chance higher" lean may be shown: 0 until >=100 calls, then grows only with the MEASURED edge of the
    // live rule over the always-guess-the-commoner baseline (10 points of edge = full weight). No measured edge = no lean shown.
    const analog = (a.learning?.leaderboard || []).find((r) => r.rule === "analog");
    const acc = analog ? analog.accuracy : a.accuracy;
    const base = Math.max(0.5, a.baseline_majority_accuracy ?? 0.5);
    const weight = n >= 100 && typeof acc === "number" ? Math.min(1, Math.max(0, (acc - base) / 0.10)) : 0;
    if (!(n >= 30)) return { n_scored: n, display_weight: 0, statement: `Live direction record is still building (${n} calls scored so far).` };
    return {
      n_scored: n,
      display_weight: weight,
      accuracy_pct: Math.round(a.accuracy * 1000) / 10,
      ci95_low_pct: Math.round(a.ci95_low * 1000) / 10,
      ci95_high_pct: Math.round(a.ci95_high * 1000) / 10,
      beats_coin_flip_significantly: a.p_vs_coin_flip < 0.01 && a.accuracy > 0.5,
      horizons: a.horizons ?? {},
      statement: a.statement,
    };
  } catch { return null; }
}

// Server-guaranteed context lines (the chat model sometimes skips optional sections, so code appends them verbatim).
// Headlines are quoted as given -- nothing is paraphrased, so nothing can be invented.
export function buildAnswerExtras(events, ctx) {
  let events_line = null, news_block = null;
  try {
    const list = (events || []).filter((e) => e.impact === "high" || /minutes/.test(e.when_text));
    if (list.length) {
      const first = list[0];
      const sameTime = list.filter((e) => e.when_text === first.when_text).slice(0, 3).map((e) => e.title);
      events_line = `**Scheduled event:** ${sameTime.join(", ")} (${first.country}) ${first.when_text}. Prices often move more around releases, so the ranges are wider when an event falls inside them.`;
    }
    const hl = (ctx?.headlines || []).slice(0, 3);
    if (hl.length) {
      news_block = "**What is in the news** (shown for context; the system is testing live whether headline sentiment predicts direction, and will only use it in the numbers if it proves it helps):\n" +
        hl.map((h) => `- ${h.headline} (${h.source}, ${h.age_text})`).join("\n");
    }
  } catch { /* extras are optional */ }
  return { events_line, news_block };
}


const EVENT_CALENDAR_URL =
  "https://raw.githubusercontent.com/iAi2025Joy/gold-predictor/main/event_calendar.json";
const HEADLINES_URL =
  "https://raw.githubusercontent.com/iAi2025Joy/gold-predictor/main/market_headlines.json";

function humanWhen(ms) {
  const mins = Math.round(ms / 60000);
  if (mins < 1) return "right now";
  if (mins < 60) return `in about ${mins} minutes`;
  const h = Math.round(mins / 6) / 10;
  return `in about ${h} hours`;
}

// Scheduled releases (CPI, jobs, central banks...) still to come in the next 6 hours. Never throws; returns [] on any problem.
async function fetchUpcomingEvents() {
  try {
    const resp = await fetch(EVENT_CALENDAR_URL, { cache: "no-store" });
    if (!resp.ok) return [];
    const file = await resp.json();
    const now = Date.now();
    return (file?.events || [])
      .map((e) => ({ e, ms: Date.parse(e.time_utc) - now }))
      .filter((x) => Number.isFinite(x.ms) && x.ms >= -60000 && x.ms <= 6 * 3600 * 1000 && (x.e.impact === "high" || x.e.impact === "medium"))
      .sort((a, b) => a.ms - b.ms)
      .slice(0, 8)
      .map((x) => ({ title: x.e.title, country: x.e.country, impact: x.e.impact, time_utc: x.e.time_utc,
        forecast: x.e.forecast ?? null, previous: x.e.previous ?? null, when_text: humanWhen(x.ms) }));
  } catch { return []; }
}

function ageText(ms) {
  const mins = Math.max(0, Math.round(ms / 60000));
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
}

// Recent headlines for this asset (last 24 h, newest first, max 6). Quoted as published; context only.
async function fetchHeadlines(asset) {
  try {
    const resp = await fetch(HEADLINES_URL, { cache: "no-store" });
    if (!resp.ok) return { headlines: [] };
    const file = await resp.json();
    const now = Date.now();
    const headlines = (file?.[asset] || [])
      .map((h) => ({ h, ms: now - Date.parse(h.published) }))
      .filter((x) => Number.isFinite(x.ms) && x.ms >= 0 && x.ms <= 24 * 3600 * 1000)
      .sort((a, b) => a.ms - b.ms)
      .slice(0, 6)
      .map((x) => ({ headline: x.h.title, source: x.h.source, age_text: ageText(x.ms) }));
    return { headlines, note: file?.note ?? null };
  } catch { return { headlines: [] }; }
}

export const DISCLAIMER = "This is not financial advice. Do your own analysis before taking your investment decisions.";

const HORIZON_KEYS = ["10min", "20min", "30min", "60min"];
const HORIZONS_PICK = ["10min", "60min"];

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
    const direction_record = await fetchDirectionRecord(asset);
    const dirWeight = direction_record?.display_weight ?? 0;
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
        widened_for: r.widened_for ?? null,
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
        direction_chance_pct: typeof r.chance_higher === "number" ? Math.round((0.5 + (r.chance_higher - 0.5) * dirWeight) * 100) : null,
        // Direction + chance, shown honestly: the raw lean (share of similar recent windows that ended higher) is only
        // trusted as far as the live record has measured real skill (dirWeight 0..1); with no measured edge it shows ~50%.
        stay_above_low_rate: r.stay_above_low_rate ?? null,
        stay_below_high_rate: r.stay_below_high_rate ?? null,
        one_sided_n: r.one_sided_n ?? 0,
        direction_basis: typeof r.chance_higher === "number"
          ? `${Math.round(r.chance_higher * 100)}% of recent comparable ${k.replace("min", "")}-minute windows ended higher`
          : null,
        direction_display: typeof r.chance_higher === "number"
          ? (() => {
              // The CALCULATED direction (share of similar past windows that ended higher) -- shown as Up/Down, together with
              // the measured live hit rate of exactly this method. The raw share is NOT shown as a probability.
              const dir = r.chance_higher >= 0.5 ? "Up" : "Down";
              
              const rec = direction_record;
              const hz = rec?.horizons?.[k];
              const hit = k === "10min"
                ? (rec && rec.accuracy_pct != null && rec.n_scored >= 30 ? `10-min live hit rate ${rec.accuracy_pct}% over ${rec.n_scored} calls` : "10-min live hit rate still building")
                : (hz && hz.n_scored >= 30 && typeof hz.accuracy === "number"
                    ? `${k.replace("min", "")}-min live hit rate ${Math.round(hz.accuracy * 1000) / 10}% over ${hz.n_scored} calls`
                    : `${k.replace("min", "")}-min live hit rate still building (${hz?.n_scored ?? 0} calls)`);
              const noLean = Math.abs(r.chance_higher - 0.5) < 0.02;
              const arrow = dir === "Up" ? "▲" : "▼";            // shown instead of the words Up / Down (coloured green / red by server.js)
              return noLean ? `~50% either way (calculated: no clear lean; ${hit})`
                            : `${arrow} (calculated; ${hit}${dirWeight > 0 ? "" : " -- no proven edge"})`;
            })()
          : "about 50% / 50% (no reliable lean)",
        typical_move_usd: Math.round(Math.max(Math.abs(r.range_low * factor - ref), Math.abs(r.range_high * factor - ref)) * 100) / 100,
        direction_lean_statement: "Up and down are about equally likely -- no reliable lean (direction is not a forecast).",
        live_hit_rate: enough ? r.live_coverage : null,
        live_ranges_scored: r.live_n ?? 0,
        live_hit_rate_statement: enough
          ? `Live record: ${(r.live_coverage * 100).toFixed(0)}% of the last ${r.live_n} ranges contained the real price (target ${Math.round((file.coverage_target ?? 0.7) * 100)}%).`
          : `Live hit rate not yet reliable (${r.live_n ?? 0} scored so far); back-testing on real 5-minute data gave roughly 66-70%.`,
      };
    }
    const upcoming_events = await fetchUpcomingEvents();
    const market_context = await fetchHeadlines(asset);
    const answer_extras = buildAnswerExtras(upcoming_events, market_context);
    const stale = a.status !== "ok" || fileAgeMinutes > 60;
    return {
      status: stale ? "stale_or_market_closed" : "ok",
      stale_note: stale
        ? "Short-term ranges are not current (market closed, data delayed, or the updater has not run recently). Say this plainly and do not present any range as current."
        : null,
      upcoming_events,
      market_context,
      answer_extras,
      direction_live_record: direction_record,
      direction_record_statement: direction_record?.statement ?? null,
      floor_ceiling_statement: (() => {
        const rows = [];
        for (const k of HORIZONS_PICK) {
          const x = ranges[k];
          if (!x?.available || x.one_sided_n < 30 || x.stay_above_low_rate == null) continue;
          const up = Math.round(x.stay_above_low_rate * 100), dn = Math.round(x.stay_below_high_rate * 100);
          rows.push(`${k.replace("min", "")} min: about ${up}% chance the price stays above $${x.downside_level} and about ${dn}% chance it stays below $${x.upside_level}`);
        }
        return rows.length ? "Price floor and ceiling (measured on real past results, not a forecast of direction) -- " + rows.join("; ") + "." : null;
      })(),
      direction_calculation_statement: (() => {
        const parts = HORIZON_KEYS.filter((k) => ranges[k]?.direction_basis).map((k) => `${k.replace("min", "")} min: ${ranges[k].direction_basis}`);
        return parts.length
          ? "How the direction is calculated: the system looks at recent comparable windows in the same trading session and counts how many ended higher; more than half = Up, fewer = Down. Right now -- " + parts.join("; ") + ". This is a count of past windows, not a probability of being right."
          : null;
      })(),
      accuracy_reading: direction_record && direction_record.accuracy_pct != null
        ? `Live direction accuracy: ${direction_record.accuracy_pct}% (${direction_record.n_scored} ten-minute calls scored so far; 50% = coin flip)`
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
  "(2) A table, one row per horizon (10, 20, 30, 60 minutes) with columns: In | Expected price (expected_price, ONE number) | Direction & chance (direction_display EXACTLY as given, character for character, the same wording on every row -- never turn it into 'Up' or 'Down' yourself) | Likely range, 70% (downside_level - upside_level) | Almost certain range, 90% (very_likely_low - very_likely_high). EVERY price in the table (expected price and both ranges) MUST carry a dollar sign and two decimals, e.g. '$4,143.37' and '$4,140.33 - $4,146.40'. Plain price levels, no +/- columns. Directly under the table, ALWAYS add one bold line: accuracy_reading EXACTLY as given (skip only if null). " +
  "(3) A short 'What this means' block of 2-3 plain bullets: the practical size of the move, quoted from typical_move_usd EXACTLY (e.g. 'Over the next 10 minutes gold will most likely stay within about $3.10 of the current price; over an hour, within about $5.70.' -- use each horizon's typical_move_usd, never the width of the range); " +
  "'Likely range' = about 7 times out of 10, 'almost certain' = about 9 times out of 10; add ONE bullet giving direction_calculation_statement EXACTLY as given (skip only if null); add ONE bullet giving floor_ceiling_statement EXACTLY as given (skip only if null); do NOT add a bullet for direction_record_statement (the accuracy line under the table and the server already carry it), and one bullet containing the exact words 'no reliable lean': 'The up/down chance is close to 50/50 -- no reliable lean -- so treat it as a rough guide, not a promise.' " +
  "(3b) Do NOT write any section about scheduled events or news headlines yourself: the server appends them verbatim after your answer. " +
  "(4) The LAST line of the answer, in plain text with no asterisks or italics, EXACTLY: 'This is not financial advice. Do your own analysis before taking your investment decisions.' " +
  "NEVER describe the Up/Down percentage as accuracy, confidence or a 70% success rate, and never present a direction as certain. Do not add live-accuracy columns or long explanations; only if the user asks about accuracy or 'full details' add live_hit_rate_statement / data timing (base_price_as_of_utc) / method_note. " +
  "If short_term_ranges is null or status is stale_or_market_closed, say so plainly and do not invent ranges. " +
  "NEVER shift or re-anchor a range to imply direction. DO NOT headline predicted_price_usd. If directional_edge_status is 'unproven', never present 'prediction' or 'prediction_probability_up' as a forecast or probability. " +
  "ACCURACY QUESTIONS: quote only real fields -- live_hit_rate / live_hit_rate_statement for ranges, rolling_direction_accuracy for direction (with rolling_predictions_tracked) -- and be clear which is which.";


// Pre-written, server-guaranteed closing note. GPT was observed skipping the "no reliable lean" explanation under the
// table, which made the "Chance higher / lower" column read like a forecast -- so server.js appends this text in code.
export function buildAnswerFooter(assetName, data, shortTerm) {
  if (!shortTerm || shortTerm.status !== "ok") return null;
  // Short fallback only -- appended in code when the model forgot to say there is no reliable lean.
  const rec = shortTerm.direction_record_statement ? ` ${shortTerm.direction_record_statement}` : "";
  return `**Note:** these are likely trading ranges, not a forecast -- up or down is close to a coin flip, so there is no reliable lean.${rec} ${DISCLAIMER}`;
}

// ---------------------------------------------------------------------------------------------------------------
// MARKET CLOSED: answer for the reopening instead of "the next 60 minutes".
// Uses weekend_gap.json (written daily by the "Update Weekend Gap Stats" workflow): how far the price moved between the
// last trade before each closure and the first trade after it, over about two years. Quantiles of that distribution give
// the 70% (15th-85th percentile) and 90% (5th-95th) ranges, so they are calibrated by construction, not guessed.
const WEEKEND_GAP_URL = "https://raw.githubusercontent.com/iAi2025Joy/gold-predictor/main/weekend_gap.json";

export async function buildOpeningForecast(asset, label, price, priceTimeText, reopensNote) {
  try {
    if (typeof price !== "number" || !(price > 0)) return null;
    const resp = await fetch(WEEKEND_GAP_URL, { cache: "no-store" });
    if (!resp.ok) return closedFallback(label, price, priceTimeText, reopensNote);
    const file = await resp.json();
    const g = file?.assets?.[asset];
    if (!g || !(g.n_gaps >= 20)) return closedFallback(label, price, priceTimeText, reopensNote);
    const usd = (n) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const at = (q) => price * Math.exp(q);
    const exp = at(g.q50), lo70 = at(g.q15), hi70 = at(g.q85), lo90 = at(g.q05), hi90 = at(g.q95);
    const upPct = Math.round(g.share_up * 100);
    const dirCell = `${g.share_up >= 0.5 ? "▲" : "▼"} (calculated; ${upPct}% of the last ${g.n_gaps} reopenings ended higher -- no proven edge)`;
    const typical = Math.round(price * g.typical_abs_pct) / 100;
    const reopenText = reopensNote ? ` Markets are expected to reopen ${reopensNote}.` : "";
    return [
      `${label} markets are currently closed.${reopenText}`,
      "",
      `${label} last traded at **${usd(price)}**${priceTimeText ? ` as of ${priceTimeText}` : ""}. Below is the estimated price when the market opens:`,
      "",
      "| When | Expected price | Direction & chance | Likely range (70%) | Almost certain range (90%) |",
      "|---|---|---|---|---|",
      `| At market opening | ${usd(exp)} | ${dirCell} | ${usd(lo70)} - ${usd(hi70)} | ${usd(lo90)} - ${usd(hi90)} |`,
      "",
      `- **Typical opening gap:** about ${usd(typical)} away from the last price (the median size of the ${g.n_gaps} closed-market gaps measured between ${g.first_gap} and ${g.last_gap}).`,
      `- **How to read the ranges:** the real opening price should land inside the 70% range about 7 times out of 10, and inside the 90% range about 9 times out of 10. They come straight from how far the price actually moved across past closures, so they are measured, not guessed.`,
      `- **Direction:** there is no reliable lean. Past reopenings are close to a coin flip, so the expected price is simply the last price, and the arrow shows only which way more of the past reopenings went.`,
      `- Once the market is open, GARNET returns to the usual 10 / 20 / 30 / 60-minute table.`,
      "",
      "This is not financial advice. Do your own analysis before taking your investment decisions.",
    ].join("\n");
  } catch { return closedFallback(label, price, priceTimeText, reopensNote); }
}

// Used when the weekend-gap statistics are not available yet: still no "next 60 minutes" table and no filler bullets.
function closedFallback(label, price, priceTimeText, reopensNote) {
  if (typeof price !== "number" || !(price > 0)) return null;
  const usd = `$${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return [
    `${label} markets are currently closed.${reopensNote ? ` Markets are expected to reopen ${reopensNote}.` : ""}`,
    "",
    `${label} last traded at **${usd}**${priceTimeText ? ` as of ${priceTimeText}` : ""}. The estimated price range for the market opening is not available right now; the usual 10 / 20 / 30 / 60-minute ranges return once the market is open.`,
    "",
    "This is not financial advice. Do your own analysis before taking your investment decisions.",
  ].join("\n");
}
