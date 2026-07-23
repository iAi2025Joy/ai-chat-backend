// goldPriceHistory.js
// ====================
//
// Adds a "get_gold_price_history" function for the chatbot to call when
// the user wants to SEE gold's recent price trend (a line chart), as
// opposed to a single prediction number (goldPrediction.js) or a single
// live price (liveGoldPrice.js).
//
// Same architecture as goldPrediction.js: fetches directly, live, from
// the gold-predictor GitHub repo's raw content URL on every request --
// no local storage, no new backend endpoints, consistent with the
// persistence fix already in place for the prediction data (Render's
// free-tier disk is not persistent; GitHub's is).

const GOLD_HISTORY_RAW_URL =
  "https://raw.githubusercontent.com/iAi2025Joy/gold-predictor/main/gold_price_history.json";

const DEFAULT_WINDOW_HOURS = 24;
const MAX_WINDOW_HOURS = 168; // 7 days -- hard cap; this tool is for short-range charts only
const MIN_POINTS = 5; // guard against a too-thin window producing an unchartable result

// ------------------------------------------------------------------
// 1. TOOL DEFINITION
// ------------------------------------------------------------------

export function getGoldPriceHistoryToolDefinition() {
  return {
    type: "function",
    function: {
      name: "get_gold_price_history",
      description:
        "Get REAL recent historical gold price data (timestamp + USD/oz pairs) for when the user wants to SEE a chart, graph, line diagram, or trend of gold's price over roughly the last 24 hours (or a similar short window) -- this is NOT a prediction/forecast (use get_gold_prediction for that) and NOT just a single current price (use get_live_gold_price or search_web for that). Use this whenever the user asks to 'draw', 'plot', 'chart', 'graph', or 'show' gold's price trend, history, or movement over the last day / 24 hours / today. After calling this, you MUST present the data using the special ```chart fenced block format described in your system instructions -- do not just describe the numbers in prose, and do not fabricate a chart without calling this function first.",
      parameters: {
        type: "object",
        properties: {
          hours: {
            type: "number",
            description:
              "How many hours of history to return, counting back from the most recent data point. Default 24 if unclear or unspecified. Do not request more than 168 (7 days) -- this tool is only meant for short-range charts.",
          },
        },
        required: [],
      },
    },
  };
}

// ------------------------------------------------------------------
// 2. FUNCTION HANDLER
// ------------------------------------------------------------------

export async function handleGoldPriceHistoryCall(argsJson) {
  let args = {};
  try {
    args = argsJson ? JSON.parse(argsJson) : {};
  } catch {
    args = {};
  }

  let hours = Number(args.hours);
  if (!hours || hours <= 0) hours = DEFAULT_WINDOW_HOURS;
  if (hours > MAX_WINDOW_HOURS) hours = MAX_WINDOW_HOURS;

  let records;
  try {
    const resp = await fetch(GOLD_HISTORY_RAW_URL, { cache: "no-store" });
    if (!resp.ok) {
      return JSON.stringify({
        error: `Price history is not available yet (HTTP ${resp.status}). The updater job may not have run yet.`,
      });
    }
    records = await resp.json();
  } catch (err) {
    return JSON.stringify({ error: "Could not reach price history data: " + err.message });
  }

  if (!Array.isArray(records) || records.length === 0) {
    return JSON.stringify({ error: "Price history file is empty or malformed." });
  }

  // Records are {"Date": "YYYY-MM-DD HH:MM:SS", "GLD": price}, already
  // sorted ascending and deduped by the Python updater. Timestamps were
  // produced from datetime.now(timezone.utc) then written via strftime,
  // which strips the timezone marker -- so treat them as UTC here too
  // (appending "Z") to parse correctly and consistently.
  const parsed = records
    .map((r) => ({ time: new Date(r.Date + "Z"), price: Number(r.GLD) }))
    .filter((r) => !isNaN(r.time.getTime()) && !isNaN(r.price));

  if (parsed.length === 0) {
    return JSON.stringify({ error: "Could not parse any valid entries from price history." });
  }

  const mostRecent = parsed[parsed.length - 1].time;
  const cutoff = new Date(mostRecent.getTime() - hours * 60 * 60 * 1000);
  const windowed = parsed.filter((r) => r.time >= cutoff);

  // If the requested window is too thin to chart meaningfully (e.g. right
  // after a cadence change in the data), fall back to the last N raw
  // points instead of returning something near-empty.
  const finalPoints = windowed.length >= MIN_POINTS ? windowed : parsed.slice(-MIN_POINTS);

  const points = finalPoints.map((r) => ({
    time: r.time.toISOString(),
    price: r.price,
  }));

  return JSON.stringify({
    hours_requested: hours,
    points,
    point_count: points.length,
    range_start: points[0]?.time ?? null,
    range_end: points[points.length - 1]?.time ?? null,
    important_context_for_the_model:
      "This is REAL historical price data, not a prediction. Present it to the user as a line chart using a fenced code block that starts with ```chart and ends with ``` -- inside the block, put ONLY a single valid JSON object (no other text, no markdown) shaped exactly like: {\"title\": \"Gold Price - Last 24 Hours (USD/oz)\", \"labels\": [\"Jul 22, 14:00\", \"Jul 22, 15:44\", ...], \"data\": [4126.93, 4131.53, ...]}. Build 'labels' as short, human-readable time labels derived from each point's time field, and 'data' as the matching price numbers in the same order -- both arrays must be the same length as the points provided here. Do not fabricate, smooth, resample, interpolate, or add points beyond what was provided. Always include a brief sentence of text before or after the chart block (e.g. noting the actual time range covered and that this is historical, not predictive, data) -- never output the chart block with no surrounding text.",
  });
}
