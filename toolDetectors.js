// toolDetectors.js
//
// Regex-based "forced tool choice" detectors -- for clear, unambiguous
// phrasing (an explicit prediction question, "show me a picture of X",
// "draw a bar chart", a classic factual lookup question), these force
// OpenAI's tool_choice to the correct tool as a CODE guarantee, rather
// than leaving tool selection purely up to the model's own judgment
// every time. Split out of server.js as its own module so a change to
// one detector's matching rules (or adding a new one) can't accidentally
// affect anything else server.js does -- these are pure functions with
// no dependency on any other module.

// ------------------------------------------------------------------
// FORCE FRESH PREDICTION TOOL CALLS -- a more reliable fix for the same
// bug the "ALWAYS CALL PREDICTION TOOLS FRESH" system prompt rule below
// already targets (a confirmed real bug: GPT sometimes reused an old
// gold/oil/DXY tool result already visible earlier in the conversation
// instead of calling the tool again, giving stale data). That prose
// instruction is labeled highest-priority but is still just a request --
// GPT can still fail to comply with it, the same way prose-only
// instructions have failed before elsewhere in this project (see the
// market-hours closed-statement history). This function instead makes
// compliance a CODE guarantee: if the user's message is clearly about
// gold, oil, or the Dollar Index/Fed rate, force that exact tool via
// OpenAI's tool_choice parameter, removing the model's ability to skip
// calling it at all for that turn. Deliberately conservative (matches
// only the unambiguous, explicit keywords) so it doesn't misfire the
// way an earlier, now-removed keyword-shortcut system did (e.g. "where
// is Jordan?" incorrectly matching a broad "where" keyword) -- for
// subtler phrasings not covered here (e.g. a Fed-rate question that
// never says "dollar"), the existing system prompt rules still apply
// as before, just without this extra forcing layer.
// Shared by detectForcedPredictionTool and detectForcedWebSearch below --
// matches requests for LONG-HORIZON historical data (multi-year, "over
// the years", "history", "decade", etc.), as distinct from a CURRENT
// price/prediction question. Neither get_gold_prediction nor
// get_gold_price_history (the latter is a strict last-24-hours window
// only, see its own tool description) can actually answer these -- see
// the comment on detectForcedPredictionTool below for the confirmed real
// bug this fixes.
//
// Deliberately does NOT require a "last"/"past" prefix before the number
// of years -- a confirmed real bug: this originally required that exact
// prefix word, and two different real messages defeated it with a typo
// on that one word ("lsast", then "alst" instead of "last"). A bare
// "\d+ years" anywhere in the message is a strong enough signal on its
// own, and is far more typo-resistant since it doesn't depend on any
// single specific word being spelled correctly. Same reasoning for
// "historic"/"historical" -- loosened to the "histor" stem plus a
// separate check for "per month"/"monthly" (a request for a month-by-
// month breakdown implies a range no current/prediction tool covers,
// regardless of whether "history" is mentioned at all).
function isLongHorizonHistoricalQuery(text) {
  return (
    /\b\d+\s*\+?\s*(years?|decades?)\b/.test(text) ||
    /\bdecade(s)?\b/.test(text) ||
    /\bhistor/.test(text) ||
    /\bover\s+the\s+years\b/.test(text) ||
    /\bper\s+month\b/.test(text) ||
    /\bmonthly\b/.test(text)
  );
}

export function detectForcedPredictionTool(message) {
  if (!message || typeof message !== "string") return null;
  const text = message.toLowerCase();

  // A confirmed real bug this fixes: asked "gold prices during last 10
  // years", this forced get_gold_prediction (matching on "gold" alone)
  // -- a tool that only covers CURRENT price/prediction, not a decade
  // of history. The tool correctly reported it didn't have that data,
  // and the model then gave up and pointed the user to external
  // financial sites instead of just searching the web itself, which it
  // is fully capable of doing. Skip forcing a prediction tool for these
  // long-horizon historical requests -- let them fall through to
  // detectForcedWebSearch below instead, which explicitly forces a real
  // search for this exact pattern.
  if (isLongHorizonHistoricalQuery(text)) return null;

  if (/\bgold\b|ذهب|\boro\b|\bouro\b|\bgoud\b|prix de l'or|cours de l'or|marché de l'or/i.test(text)) return "get_gold_prediction";
  if (/\boil\b|\bwti\b|\bcrude\b|نفط|بترول|\bpetróleo\b|\bpetrolio\b|\bpétrole\b|\bbrut\b|\bolie\b|\böl\b/i.test(text)) return "get_oil_prediction";
  if (/\bdxy\b|\bdollar index\b|\bfed(eral)?\s*(funds\s*)?rate\b|\binterest rate\b|دولار|سعر الفائدة|الفيدرالي|مؤشر الدولار|tasa de interés|índice dólar|taux d'intérêt|indice dollar|tasso di interesse|taxa de juros|zinssatz|leitzins|rentetarief/i.test(text)) return "get_dxy_prediction";

  return null;
}

// ------------------------------------------------------------------
// FORCE search_web_images FOR CLEAR IMAGE REQUESTS -- a confirmed real
// bug this fixes: asked to "show a photo of X", GPT called search_web
// (the ordinary TEXT search tool) instead of search_web_images, then
// hand-wrote its own markdown ![]() image links around URLs it noticed
// in the text search snippets/citations -- not real image data from a
// real image search, and not the ```images fenced block format the
// frontend actually knows how to render into a gallery. A follow-up
// asking for "a real photo not a link" repeated the same mistake,
// confirming this is a real, repeatable failure mode, not a one-off.
// Same fix as detectForcedPredictionTool above: make tool selection a
// CODE guarantee via OpenAI's tool_choice for the unambiguous cases,
// rather than relying on the system prompt's SHOWING IMAGES rule alone.
// Deliberately limited to clear, explicit visual-intent phrasing so it
// doesn't misfire on messages that only mention an image in passing.
export function detectForcedImageSearch(message) {
  if (!message || typeof message !== "string") return null;
  const text = message.toLowerCase();

  if (
    /\b(photo|photos|picture|pictures|pics?|image|images)\s+of\b/.test(text) ||
    /\bshow\s+(me\s+)?(a\s+|some\s+)?(real\s+|actual\s+|genuine\s+)?(photo|photos|picture|pictures|pics?|image|images)\b/.test(text) ||
    /\bwhat\s+(does|do)\b.+\blook\s+like\b/.test(text) ||
    /\bfind\s+(me\s+)?(a\s+|some\s+)?(photo|photos|picture|pictures|pics?|image|images)\b/.test(text) ||
    // A confirmed real bug this fixes: "explain about plant cells with
    // images" matched NONE of the patterns above (no "of", no "show
    // me", no "find me"), so it fell through to soft prompt guidance
    // instead of a guaranteed tool_choice -- and GPT wrote fake
    // "[Source](url)" markdown links to Pexels PAGE urls (from an
    // ordinary text search, not a real image search) instead of
    // actually calling search_web_images and using a real ```images
    // gallery block. "with image(s)/photo(s)/picture(s)" is an
    // equally explicit, unambiguous request to see real images as any
    // of the patterns above -- it deserves the same hard guarantee.
    /\bwith\s+(some\s+|a\s+few\s+|a\s+couple\s+of\s+)?(photo|photos|picture|pictures|pics?|image|images)\b/.test(text)
  ) {
    return "search_web_images";
  }

  return null;
}

// ------------------------------------------------------------------
// FORCE render_chart FOR CLEAR CHART/GRAPH REQUESTS -- a confirmed real
// bug this fixes: asked for a bar/pie chart, GPT sometimes wrote prose
// ANNOUNCING a chart ("here's how this can be visualized...") without
// ever actually calling render_chart, or wrote a raw ```chart fenced
// block by hand instead of using the tool. Same fix as
// detectForcedImageSearch/detectForcedPredictionTool above: make tool
// selection a CODE guarantee via tool_choice for the unambiguous cases
// rather than relying on the system prompt's CHARTS rule alone.
// Deliberately limited to clear, explicit chart/graph/plot/diagram
// phrasing so it doesn't misfire on messages that only mention a chart
// in passing (e.g. "I saw a chart online that said..."). Must be
// checked BEFORE detectForcedWebSearch in the forcedToolName chain --
// detectForcedWebSearch matches almost everything by default, so a
// chart request would be swallowed by it first if this ran after.
export function detectForcedChartRequest(message) {
  if (!message || typeof message !== "string") return null;
  const text = message.toLowerCase();

  if (
    /\b(bar|pie|line|venn)\s*(chart|graph|diagram)\b/.test(text) ||
    /\b(chart|graph|plot|visuali[sz]e|diagram)\b.*\b(this|that|it|data|numbers|prices?|trend|breakdown|comparison|overlap)\b/.test(text) ||
    /\b(draw|show|make|create|build|generate)\s+(me\s+)?(a\s+)?(bar|pie|line)?\s*(chart|graph|plot)\b/.test(text) ||
    /\bvenn\s*diagram\b/.test(text)
  ) {
    return "render_chart";
  }

  return null;
}

// ------------------------------------------------------------------
// FORCE search_web FOR CLASSIC FACTUAL LOOKUP QUESTIONS -- a confirmed
// real bug this fixes: asked "where is village Meddin in Jordan", GPT
// did not call search_web at all and instead answered directly from
// memory, going as far as INVENTING a fake citation link
// (wikiedit.org/... -- not a real site) rather than admitting it didn't
// know or actually searching. The "SEARCH PROACTIVELY" system prompt
// rule alone was not reliable enough to prevent this, the same way
// prose-only instructions have repeatedly failed elsewhere in this
// project (see the market-hours closed-statement and Fed-rate history
// above). This makes the most common, unambiguous factual-lookup
// phrasings ("where is X", "who is X", "when did X", "how many/much
// X") a CODE guarantee via tool_choice instead, so the model cannot
// skip search_web and guess for these. Deliberately excludes questions
// that mention the assistant itself ("you"/"your"/"garnet") since those
// are about GARNET's own identity/data, not an external fact to look
// up, and are governed by their own separate rules instead. Left out
// generic "what is X" on purpose -- that pattern is broad enough to
// also catch simple conceptual/definitional questions GPT already
// answers well and quickly from general knowledge (e.g. "what is
// photosynthesis"), where forcing a search on every single one would be
// unnecessary and slow; "where/who/when/how many" are more reliably
// signals of a specific external fact being requested.
// ------------------------------------------------------------------
// FORCE search_web BY DEFAULT, WITH A SHORT EXCLUSION LIST -- replaces
// an earlier, narrower version of this function that tried to
// positively match every possible way someone might phrase a factual
// question (WH-questions, "give me", "list", "find", etc.). That
// approach kept failing in confirmed, real ways: a single typo ("lsast"
// instead of "last") silently broke a whole pattern match, and
// imperative phrasings kept turning up that the list hadn't anticipated
// yet. A short EXCLUSION list is far more robust than an ever-growing
// positive list -- the default is now "search the web", and only a
// small set of clearly non-factual message types (small talk, creative
// writing, code, simple math, questions about GARNET itself) opt out.
export function detectForcedWebSearch(message) {
  if (!message || typeof message !== "string") return null;
  const text = message.toLowerCase().trim();
  if (!text) return null;

  // Skip -- about GARNET itself (identity, its own data/methodology),
  // not an external fact to search for.
  if (/\byou\b|\byour\b|\bgarnet\b/.test(text)) return null;

  // Skip -- short conversational filler/greetings/acknowledgements, not
  // an actual question needing information.
  if (
    text.length < 25 &&
    /^(hi|hello|hey|hiya|yo|thanks|thank\s+you|thx|ok|okay|sure|cool|nice|great|bye|goodbye|good\s+morning|good\s+night|good\s+afternoon|good\s+evening|yes|no|yep|nope|please|got\s+it|sounds\s+good)\b/.test(text)
  ) {
    return null;
  }

  // Skip -- creative writing, code, or math requests: not external facts
  // to look up, and forcing a search would just add pointless latency.
  if (/\b(poem|story|joke|song|lyrics?|essay|letter|email\s+draft|code|script|recipe|riddle)\b/.test(text)) return null;
  if (/^\s*(write|draft|compose|create|generate|make)\b/.test(text) && !/\b(current|latest|recent|today|now|real)\b/.test(text)) return null;
  if (/^\s*(what('?s)?\s+is\s+)?\d+\s*[+\-*/x]\s*\d+/.test(text)) return null; // simple arithmetic

  return "search_web";
}

