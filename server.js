import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import OpenAI from "openai";
import {
  getGoldPredictionToolDefinition,
  handleGoldPredictionCall,
} from "./goldPrediction.js";
import {
  performWebSearch,
  formatSearchResultsForModel,
  getWebSearchToolDefinition,
  handleWebSearchCall,
  getWebImageSearchToolDefinition,
  handleWebImageSearchCall,
  getFetchPageToolDefinition,
  handleFetchPageCall,
} from "./webSearch.js";
import { getLiveGoldPriceToolDefinition, handleLiveGoldPriceCall } from "./liveGoldPrice.js";
import {
  getGoldPriceHistoryToolDefinition,
  handleGoldPriceHistoryCall,
} from "./goldPriceHistory.js";
import { getOilPredictionToolDefinition, handleOilPredictionCall } from "./oilPrediction.js";
import { getLiveOilPriceToolDefinition, handleLiveOilPriceCall } from "./liveOilPrice.js";
import { getDxyPredictionToolDefinition, handleDxyPredictionCall } from "./dxyPrediction.js";
import {
  handleListUsers,
  handleDisableUser,
  handleEnableUser,
  handleDeleteUser,
  handleBootstrapAdmin,
  handleListUserChats,
  handleGetUserChatMessages,
} from "./adminUsers.js";
import { handleRequestPasswordReset } from "./passwordReset.js";
import { handleRequestEmailVerification } from "./emailVerification.js";
import { extractDocumentsText } from "./documentParser.js";
import { transcribeAudio } from "./audioTranscriber.js";
import { isElevenLabsConfigured, listElevenLabsVoices, streamSpeechElevenLabs } from "./elevenLabsTTS.js";

const app = express();

// Human-readable status labels for each real tool -- used by the SSE
// status events in the /chat route (see sendEvent there) so the
// frontend's "thinking" indicator shows what's ACTUALLY running at that
// exact moment, not a guessed word from a local rotation.
const TOOL_STATUS_LABELS = {
  get_gold_prediction: "Checking the gold prediction model",
  get_oil_prediction: "Checking the oil prediction model",
  get_dxy_prediction: "Checking the Dollar Index prediction model",
  get_live_gold_price: "Checking the live gold price",
  get_live_oil_price: "Checking the live oil price",
  get_gold_price_history: "Pulling gold price history",
  search_web: "Searching the web",
  search_web_images: "Searching for images",
  fetch_web_page: "Reading a web page",
  render_chart: "Building the chart",
  create_project_zip: "Packaging the project files",
};

// A confirmed real gap this fixes: the status shown right AFTER a tool
// finishes (between rounds, before the model decides what's next) was
// picking a generic word from REVIEW_PHASE_WORDS -- real in the sense
// that it fired at a genuine checkpoint, but not actually describing
// WHAT was just reviewed. This maps each tool to a specific label
// referencing the real thing that just happened, so "Reviewing the
// search results" only shows up when search_web genuinely just ran, not
// as an interchangeable generic phrase. Falls back to the
// REVIEW_PHASE_WORDS pool only for a tool with no specific mapping.
const TOOL_REVIEW_LABELS = {
  get_gold_prediction: "Reviewing the prediction data",
  get_oil_prediction: "Reviewing the prediction data",
  get_dxy_prediction: "Reviewing the prediction data",
  get_live_gold_price: "Reviewing the live price",
  get_live_oil_price: "Reviewing the live price",
  get_gold_price_history: "Reviewing the price history",
  search_web: "Reviewing the search results",
  search_web_images: "Reviewing the images found",
  fetch_web_page: "Reviewing the page content",
  render_chart: "Reviewing the chart",
  create_project_zip: "Reviewing the project files",
};

// Research-related tools get a guaranteed preceding "Investigating"
// event, on top of their own specific label -- a confirmed real
// complaint this fixes: "Investigating" was sitting in a random pool
// that specific tool labels almost always won out over (since nearly
// every real tool call has an explicit label), so it rarely actually
// appeared even though it was technically in the code. Now it's a
// deterministic, guaranteed step instead of a coin flip.
const RESEARCH_TOOLS = new Set(["search_web", "search_web_images", "fetch_web_page"]);

// Small rotating word pools for the handful of GENERIC phases that can
// legitimately happen more than once in a single turn (e.g. multiple
// tool-call rounds) -- each pool is still tied to a REAL, specific point
// in the code (start of processing, right after tool results come back,
// right before drafting final text), just with varied wording each time
// so a multi-round turn doesn't repeat the identical phrase over and
// over. Picking by round number (not random) keeps it deterministic and
// testable, while still only ever firing when that real phase actually
// happens.
const START_PHASE_WORDS = ["Thinking", "Identifying what's needed", "Investigating your question", "Understanding what's being asked", "Figuring out the best approach"];
const REVIEW_PHASE_WORDS = ["Reviewing what I found", "Weighing the details", "Analyzing what I found", "Investigating further", "Finding information", "Gathering the details", "Piecing it together", "Cross-checking the details", "Looking into it further", "Making sense of it"];
const FINALIZE_PHASE_WORDS = ["Finalizing the response", "Honing the response", "Refining the answer", "Putting it all together", "Wrapping up the details", "Polishing the response"];

// A confirmed real bug this fixes: pickPhaseWord originally took a
// round-number argument to pick a pool index -- but several call sites
// (especially the very first status event of every request) always
// passed the same fixed number, so that pool index was the only word
// that could ever show there ("Thinking" always, "Identifying what's
// needed" and "Investigating your question" never, even though they
// were in the same pool) -- not real variety, just a different-looking
// bug. Switched to genuine random selection so every real event
// actually varies request to request.
function pickPhaseWord(pool) {
  return pool[Math.floor(Math.random() * pool.length)];
}

// Render sits behind its own reverse proxy -- without this, req.ip would
// return Render's proxy IP for EVERY visitor (making the rate limiter
// below either block everyone as "one IP" or fail to distinguish real
// abusers from legitimate users). This tells Express to trust the
// X-Forwarded-For header Render sets, so req.ip reflects the real client.
app.set("trust proxy", 1);

app.use(cors());
// The default Express JSON body limit (100KB) is nowhere near enough
// for base64-encoded image/document attachments -- base64 itself
// already inflates raw file size by ~33%, and a single legitimate PDF
// or image can easily be several MB before that even applies. Without
// raising this, any real attachment larger than ~75KB failed with a
// genuine PayloadTooLargeError from Express itself (confirmed via
// Render's logs) -- which surfaced to the user as a generic, misleading
// "Connection error", not anything related to document parsing itself.
// 60mb covers not just a single message's own attachments (15MB
// documents / 5MB images, ~33% larger once base64-encoded) but also
// several turns' worth of images now carried in conversation history
// (see MAX_HISTORY_IMAGE_TURNS below) -- a real cause of "Server error"
// seen once multiple images had accumulated in one conversation.
app.use(express.json({ limit: "60mb" }));

// ------------------------------------------------------------------
// RATE LIMITING -- a confirmed real gap this closes: the /chat endpoint
// had no protection at all, meaning anyone who found the raw Render URL
// could script repeated calls directly (bypassing the website entirely)
// and run up the OpenAI API bill with no limit. This is a simple,
// dependency-free, in-memory rate limiter -- no new npm package needed.
// Deliberately generous (15 requests/minute/IP) so real chat usage never
// hits it, while still blocking obvious scripted abuse. In-memory state
// resets whenever Render restarts the service (e.g. after idling down),
// which is fine for this purpose -- it's a basic abuse deterrent, not a
// security-critical control (there's no sensitive data behind this
// endpoint to protect, only API cost to limit).
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 15;
const requestLog = new Map(); // ip -> array of request timestamps (ms)

function rateLimitChat(req, res, next) {
  const ip = req.ip || "unknown";
  const now = Date.now();

  const timestamps = (requestLog.get(ip) || []).filter(
    (t) => now - t < RATE_LIMIT_WINDOW_MS
  );

  if (timestamps.length >= RATE_LIMIT_MAX_REQUESTS) {
    return res.status(429).json({
      error: "Too many requests. Please wait a moment before trying again.",
    });
  }

  timestamps.push(now);
  requestLog.set(ip, timestamps);
  next();
}

// Periodic sweep so requestLog doesn't grow forever from one-off visitors
// whose entries would otherwise never get touched/cleaned again.
setInterval(() => {
  const now = Date.now();
  for (const [ip, timestamps] of requestLog.entries()) {
    const recent = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
    if (recent.length === 0) {
      requestLog.delete(ip);
    } else {
      requestLog.set(ip, recent);
    }
  }
}, 5 * 60 * 1000); // every 5 minutes

// Health check route (GET /) so we can verify the service is up
app.get("/", (req, res) => {
  res.send("✅ AI Chat backend is running successfully!");
});


const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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

function detectForcedPredictionTool(message) {
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
function detectForcedImageSearch(message) {
  if (!message || typeof message !== "string") return null;
  const text = message.toLowerCase();

  if (
    /\b(photo|photos|picture|pictures|pics?|image|images)\s+of\b/.test(text) ||
    /\bshow\s+(me\s+)?(a\s+|some\s+)?(real\s+|actual\s+|genuine\s+)?(photo|photos|picture|pictures|pics?|image|images)\b/.test(text) ||
    /\bwhat\s+(does|do)\b.+\blook\s+like\b/.test(text) ||
    /\bfind\s+(me\s+)?(a\s+|some\s+)?(photo|photos|picture|pictures|pics?|image|images)\b/.test(text)
  ) {
    return "search_web_images";
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
function detectForcedWebSearch(message) {
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

// ✅ Converts plain URLs into clickable HTML hyperlinks
function convertLinksToHTML(text) {
  // Improved regex: avoids capturing trailing punctuation like ) , . etc.,
  // AND stops at '<' so it doesn't swallow an immediately-following HTML
  // tag (e.g. a URL right before a closing </p> from formatMarkdownToHTML,
  // with no whitespace in between) -- found and fixed via direct testing,
  // not assumed.
  const urlRegex = /(https?:\/\/[^\s)>,<]+)/g;
  return text.replace(urlRegex, '<a href="$1" target="_blank" style="color:#4ea3ff;text-decoration:underline;">$1</a>');
}

// Builds the exact <div class="price-chart" data-chart="..."> HTML the
// frontend's Chart.js renderer looks for -- shared by both the legacy
// ```chart fenced-block path in formatMarkdownToHTML below (kept as a
// harmless fallback in case GPT still writes one) AND the new
// render_chart TOOL (see getRenderChartToolDefinition below), which is
// now the primary, recommended way to produce a chart.
function buildChartDivHtml(chartObj) {
  const safeJson = JSON.stringify(chartObj)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<div class="price-chart" data-chart="${safeJson}"><canvas></canvas></div>`;
}

// ------------------------------------------------------------------
// RENDER_CHART TOOL -- a confirmed real bug this fixes: asked to show a
// bar or pie chart of real data it had already gathered, GPT wrote
// prose ANNOUNCING a chart ("Here's how this can be visualized in a pie
// chart format:") and then never actually included a valid ```chart
// fenced block at all -- the same category of prose-compliance failure
// that's shown up repeatedly elsewhere in this project (market-closed
// statements, etc.), just in a new spot. Hand-authoring a perfectly-
// formed JSON blob inside an exact fenced-code-block syntax, correctly,
// every single time, turned out not to be reliable. This tool sidesteps
// that entirely: GPT calls it with plain structured arguments (far
// simpler for a model to get right than freeform fenced-block text),
// and the SERVER builds the actual chart HTML directly in code (see
// buildChartDivHtml above) and appends it to the final answer itself --
// removing GPT's own text formatting from the chart-rendering step
// completely, the same "capture it from real tool output, apply it in
// code" pattern already used for the market-closed statement fix.
// ------------------------------------------------------------------

function getRenderChartToolDefinition() {
  return {
    type: "function",
    function: {
      name: "render_chart",
      description:
        "Render a real chart or diagram for the user using data you actually have -- from a tool result (get_gold_price_history, search_web, fetch_web_page) or genuinely well-known facts. This DIRECTLY renders it for the user automatically -- do NOT also try to write a ```chart fenced code block or repeat the raw data yourself; just call this function, then continue your response normally (a short sentence of context is enough -- the visual appears automatically, you don't need to describe how it could be visualized, just render it). Use 'line' for a trend over time (e.g. price history), 'bar' for comparing several items, 'pie' for parts of a whole/percentages that add up to ~100%, 'venn' for showing overlap between 2 or 3 groups/categories (e.g. 'countries that speak French vs Spanish vs both', 'skills shared between two job roles'). For 'venn', use the 'sets' parameter instead of labels/data -- give each set's label and its actual real members as a list of strings; the overlaps are computed automatically from what's actually shared between the lists, don't calculate overlap counts yourself. NEVER invent or estimate numbers/items just to have something to chart -- only call this with real data.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Short chart title, e.g. 'Educational Attainment in Jordan (%)'." },
          type: { type: "string", enum: ["line", "bar", "pie", "venn"], description: "Visualization type." },
          labels: {
            type: "array",
            items: { type: "string" },
            description: "For line/bar/pie only: category/x-axis labels, e.g. ['Primary', 'Secondary', 'Tertiary'] or dates for a line chart. Must be the same length as data. Not used for 'venn' -- use 'sets' instead.",
          },
          data: {
            type: "array",
            items: { type: "number" },
            description: "For line/bar/pie only: the real numeric values, same order and same length as labels. Not used for 'venn' -- use 'sets' instead.",
          },
          yAxisLabel: { type: "string", description: "Optional y-axis label for line/bar charts, e.g. 'USD/oz' or 'Percent'. Omit for pie/venn." },
          sets: {
            type: "array",
            description: "REQUIRED for type 'venn' only, ignored otherwise. Exactly 2 or 3 sets to compare.",
            items: {
              type: "object",
              properties: {
                label: { type: "string", description: "This set's name, e.g. 'French-speaking countries'." },
                items: {
                  type: "array",
                  items: { type: "string" },
                  description: "The real, actual members of this set, e.g. ['France', 'Senegal', 'Canada']. Overlaps with other sets are computed automatically by matching identical strings (case-insensitive) -- keep naming consistent across sets (e.g. always 'USA', not 'USA' in one set and 'United States' in another) so real overlaps are actually detected.",
                },
              },
              required: ["label", "items"],
            },
          },
        },
        required: ["title", "type"],
      },
    },
  };
}

// Computes REAL set overlaps for a Venn diagram -- given 2 or 3 sets of
// actual items (strings), returns which items are unique to each set and
// which are shared, matched case-insensitively (so "USA" in one set and
// "usa" in another are correctly recognized as the same real item).
// Deliberately done in CODE, not left to the model to calculate itself --
// counting real overlaps between lists is exactly the kind of mechanical
// task a model can get subtly wrong (miscounting, missing a case-
// variant match), and a wrong Venn diagram would misrepresent real data.
function computeVennRegions(sets) {
  const normalized = sets.map((s) => {
    const map = new Map(); // normalized (lowercase/trimmed) -> original display casing, first occurrence wins
    for (const item of s.items) {
      const norm = String(item).trim().toLowerCase();
      if (norm && !map.has(norm)) map.set(norm, String(item).trim());
    }
    return { label: s.label, map };
  });

  if (normalized.length === 2) {
    const [A, B] = normalized;
    const onlyA = [...A.map.keys()].filter((k) => !B.map.has(k)).map((k) => A.map.get(k));
    const onlyB = [...B.map.keys()].filter((k) => !A.map.has(k)).map((k) => B.map.get(k));
    const both = [...A.map.keys()].filter((k) => B.map.has(k)).map((k) => A.map.get(k));
    return { setCount: 2, labels: [A.label, B.label], regions: { onlyA, onlyB, both } };
  }

  if (normalized.length === 3) {
    const [A, B, C] = normalized;
    const allKeys = new Set([...A.map.keys(), ...B.map.keys(), ...C.map.keys()]);
    const onlyA = [], onlyB = [], onlyC = [], AB = [], AC = [], BC = [], ABC = [];
    for (const k of allKeys) {
      const a = A.map.has(k), b = B.map.has(k), c = C.map.has(k);
      const display = A.map.get(k) || B.map.get(k) || C.map.get(k);
      if (a && b && c) ABC.push(display);
      else if (a && b) AB.push(display);
      else if (a && c) AC.push(display);
      else if (b && c) BC.push(display);
      else if (a) onlyA.push(display);
      else if (b) onlyB.push(display);
      else onlyC.push(display);
    }
    return { setCount: 3, labels: [A.label, B.label, C.label], regions: { onlyA, onlyB, onlyC, AB, AC, BC, ABC } };
  }

  return null;
}

// Builds the <div class="venn-chart" data-venn="..."> marker the frontend
// looks for and renders as an actual SVG Venn diagram -- same
// "backend validates and prepares real data, frontend draws it" split as
// buildChartDivHtml above, just a different element/renderer since a
// Venn diagram isn't a Chart.js chart type at all.
function buildVennDivHtml(title, vennResult) {
  const payload = { title, ...vennResult };
  const safeJson = JSON.stringify(payload)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<div class="venn-chart" data-venn="${safeJson}"></div>`;
}

function handleVennChartCall(args) {
  const { title, sets } = args;
  if (!Array.isArray(sets) || (sets.length !== 2 && sets.length !== 3)) {
    console.error("render_chart (venn): validation failed -- sets must be an array of exactly 2 or 3 items.", "raw args:", JSON.stringify(args));
    return {
      toolResult: JSON.stringify({ error: "For type 'venn', sets must be an array of exactly 2 or 3 {label, items} objects." }),
      chartHtml: null,
    };
  }
  for (const s of sets) {
    if (!s || typeof s.label !== "string" || !Array.isArray(s.items) || s.items.length === 0) {
      console.error("render_chart (venn): validation failed -- each set needs a label and non-empty items array.", "raw args:", JSON.stringify(args));
      return {
        toolResult: JSON.stringify({ error: "Each set needs a 'label' string and a non-empty 'items' array." }),
        chartHtml: null,
      };
    }
  }

  const vennResult = computeVennRegions(sets);
  const chartHtml = buildVennDivHtml(title || "", vennResult);

  console.log(`render_chart (venn): SUCCESS. setCount=${vennResult.setCount}, title=${JSON.stringify(title || "")}`);

  return {
    toolResult: JSON.stringify({
      success: true,
      note: "Venn diagram created and will be shown to the user automatically. Do not repeat the overlap data yourself in a list -- the computed_regions below are the REAL overlaps if you want to reference specific shared/unique items in your own text, just continue your response normally otherwise.",
      computed_regions: vennResult.regions,
    }),
    chartHtml,
  };
}

function handleRenderChartCall(argsJson) {
  let args = {};
  try {
    args = argsJson ? JSON.parse(argsJson) : {};
  } catch (err) {
    console.error("render_chart: could not parse arguments JSON:", err.message, "raw:", argsJson);
    return { toolResult: JSON.stringify({ error: "Could not parse chart arguments." }), chartHtml: null };
  }

  // Tolerate minor variations GPT might send despite the strict enum
  // (e.g. "Bar", "bar chart", trailing/leading whitespace) rather than
  // failing validation on something trivially fixable.
  let type = (args.type || "").toString().trim().toLowerCase().replace(/\s*chart$/, "");

  if (type === "venn") {
    return handleVennChartCall(args);
  }

  const { title, labels, data, yAxisLabel } = args;

  if (!Array.isArray(labels) || !Array.isArray(data) || labels.length === 0 || data.length === 0) {
    console.error(
      "render_chart: validation failed (missing/empty labels or data).",
      "labels:", Array.isArray(labels) ? labels.length : typeof labels,
      "data:", Array.isArray(data) ? data.length : typeof data,
      "raw args:", JSON.stringify(args)
    );
    return {
      toolResult: JSON.stringify({ error: "labels and data must both be non-empty arrays." }),
      chartHtml: null,
    };
  }

  // A confirmed real, REPEATABLE pattern from real Render logs: the
  // model consistently sends exactly one more label than data point for
  // a multi-year range (e.g. 21 year-labels for a 20-year span, but only
  // 20 actual values) -- an off-by-one in its own year-counting, not a
  // sign it's not calling the tool or lacking real data. The earlier
  // strict "must be exactly equal" check rejected every single one of
  // these attempts outright, and forcing a retry with the same
  // instructions just reproduced the identical off-by-one every time
  // (confirmed: 3 retries in the same log, same exact mismatch each
  // time) -- so rejecting was never going to self-correct on its own.
  // A small mismatch here is auto-corrected by truncating both arrays to
  // the shorter length, rather than failing a chart outright over an
  // easily-fixed off-by-one. Only a LARGER mismatch (more likely an
  // actual data problem, not just a counting slip) still fails.
  let finalLabels = labels;
  let finalData = data;
  if (labels.length !== data.length) {
    const minLen = Math.min(labels.length, data.length);
    if (Math.abs(labels.length - data.length) <= 2 && minLen > 0) {
      console.error(
        `render_chart: auto-correcting labels/data length mismatch (labels: ${labels.length}, data: ${data.length}) by truncating both to ${minLen}.`,
        "raw args:", JSON.stringify(args)
      );
      finalLabels = labels.slice(0, minLen);
      finalData = data.slice(0, minLen);
    } else {
      console.error(
        "render_chart: validation failed (labels/data mismatch too large to auto-correct).",
        "labels:", labels.length, "data:", data.length,
        "raw args:", JSON.stringify(args)
      );
      return {
        toolResult: JSON.stringify({ error: "labels and data must be arrays of the same length." }),
        chartHtml: null,
      };
    }
  }

  if (!["line", "bar", "pie"].includes(type)) {
    console.error("render_chart: invalid type.", "received type:", JSON.stringify(args.type), "raw args:", JSON.stringify(args));
    return { toolResult: JSON.stringify({ error: "type must be 'line', 'bar', or 'pie'." }), chartHtml: null };
  }

  const chartHtml = buildChartDivHtml({
    title: title || "",
    type,
    labels: finalLabels,
    data: finalData.map(Number),
    yAxisLabel: yAxisLabel || undefined,
  });

  // A confirmed real gap this fixes: only failure paths were logged
  // before, so a fully successful call (matching label/data lengths,
  // valid type) produced ZERO log output -- making it impossible to
  // distinguish "render_chart was never called" from "it was called and
  // actually succeeded" just by looking at the Render logs, which is
  // exactly the ambiguity that came up while debugging a real report of
  // the chart still not appearing despite no error being logged.
  console.log(
    `render_chart: SUCCESS. type=${type}, points=${finalLabels.length}, title=${JSON.stringify(title || "")}, chartHtml_length=${chartHtml.length}`
  );

  return {
    toolResult: JSON.stringify({
      success: true,
      note: "Chart created and will be shown to the user automatically. Do not also write a ```chart block or repeat this data yourself -- just continue your response normally.",
    }),
    chartHtml,
  };
}

// ------------------------------------------------------------------
// CREATE_PROJECT_ZIP TOOL -- for multi-file projects (a LaTeX/Overleaf
// project with main.tex + references.bib + a .cls/.sty file, or any
// other multi-file code project) that genuinely need several real
// files, not just one code block. GPT provides real filenames and real
// file contents; the server packages them into a marker div the
// frontend turns into an actual downloadable .zip -- the actual ZIP
// bytes are built CLIENT-SIDE (see buildZipBlob in index.html), not
// here, since that avoids adding a new server-side npm dependency for
// something the browser can do natively with a small, hand-verified
// ZIP writer (tested directly against Python's zipfile module and the
// system unzip tool before ever being wired into the app).
// ------------------------------------------------------------------

function getCreateProjectZipToolDefinition() {
  return {
    type: "function",
    function: {
      name: "create_project_zip",
      description:
        "Create a downloadable .zip file containing MULTIPLE real files -- use this specifically for a multi-file LaTeX/Overleaf project (e.g. main.tex plus references.bib plus a custom .cls/.sty file, or files organized into subfolders like sections/intro.tex) or any other project that genuinely needs several separate files to work together. Do NOT use this for a single file -- if the user just wants one LaTeX document, one Python script, etc., use a normal fenced code block instead (```latex, ```python, etc.), which already renders as its own code window with a copy button; only reach for this tool when there are genuinely multiple files that belong together as a project. This DIRECTLY renders a real download card for the user automatically -- do not also paste the file contents as code blocks in your text, that would just duplicate what's already downloadable. After calling this, continue your response normally with a short sentence of context (e.g. what the project does, how to use it in Overleaf) -- you don't need to list out the files again, the card already shows them.",
      parameters: {
        type: "object",
        properties: {
          projectName: { type: "string", description: "Short project name, e.g. 'IEEE Conference Paper' -- used as the zip's display title and filename." },
          files: {
            type: "array",
            description: "Every real file the project needs. Use forward slashes for subfolders, e.g. 'sections/intro.tex'.",
            items: {
              type: "object",
              properties: {
                filename: { type: "string", description: "Relative path/filename within the project, e.g. 'main.tex' or 'sections/intro.tex'." },
                content: { type: "string", description: "The REAL, complete content of this file. Never a placeholder or 'TODO' -- write the actual working content." },
              },
              required: ["filename", "content"],
            },
          },
        },
        required: ["projectName", "files"],
      },
    },
  };
}

function handleCreateProjectZipCall(argsJson) {
  let args = {};
  try {
    args = argsJson ? JSON.parse(argsJson) : {};
  } catch (err) {
    console.error("create_project_zip: could not parse arguments JSON:", err.message, "raw:", argsJson);
    return { toolResult: JSON.stringify({ error: "Could not parse project arguments." }), zipHtml: null };
  }

  const { projectName, files } = args;
  if (!Array.isArray(files) || files.length === 0) {
    console.error("create_project_zip: validation failed -- files must be a non-empty array.", "raw args:", JSON.stringify(args).slice(0, 500));
    return { toolResult: JSON.stringify({ error: "files must be a non-empty array of {filename, content} objects." }), zipHtml: null };
  }
  if (files.length < 2) {
    // Not a hard failure -- still build it if asked, but steer future
    // calls back toward the simpler, already-working code-block path
    // for genuinely single-file requests.
    console.error("create_project_zip: called with only 1 file -- a single file should normally use a fenced code block instead.", "raw args:", JSON.stringify(args).slice(0, 300));
  }
  for (const f of files) {
    if (!f || typeof f.filename !== "string" || !f.filename.trim() || typeof f.content !== "string") {
      console.error("create_project_zip: validation failed -- each file needs a real filename and content.", "raw args:", JSON.stringify(args).slice(0, 500));
      return { toolResult: JSON.stringify({ error: "Each file needs a non-empty 'filename' string and a 'content' string." }), zipHtml: null };
    }
  }

  const payload = {
    projectName: projectName || "project",
    files: files.map((f) => ({
      filename: f.filename.trim(),
      // Same convertLinksToHTML protection already used for charts/code
      // -- LaTeX files commonly contain real URLs (\url{...}, bib entry
      // url fields) that would otherwise get an <a> tag injected into
      // the middle of the file content sitting in this HTML attribute.
      // Reversed by the frontend right before the ZIP bytes are built.
      content: f.content.replace(/:\/\//g, ":%2F%2F"),
    })),
  };
  const safeJson = JSON.stringify(payload)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const zipHtml = `<div class="project-zip" data-zip="${safeJson}"></div>`;

  console.log(`create_project_zip: SUCCESS. projectName=${JSON.stringify(projectName || "")}, fileCount=${files.length}, files=${files.map((f) => f.filename).join(", ")}`);

  return {
    toolResult: JSON.stringify({
      success: true,
      note: "Project zip created and a download card will be shown to the user automatically. Do not repeat the file contents as code blocks -- just continue your response normally.",
    }),
    zipHtml,
  };
}

// ✅ Converts GPT's typical markdown-style output (bold, bullet lists,
// numbered lists, line breaks, ```mermaid fenced diagram blocks, and now
// ```chart fenced price-history blocks) into HTML the frontend can
// actually render, since the chat widget displays replies via innerHTML
// but GPT commonly defaults to markdown syntax unless the raw text is
// converted first.
function formatMarkdownToHTML(text) {
  if (!text) return text;

  // Extract ```mermaid ... ``` fenced blocks FIRST, before any line-by-line
  // processing touches them -- Mermaid diagram syntax spans multiple lines
  // with its own internal structure (arrows, node definitions, etc.) that
  // would be corrupted if run through the paragraph/heading/list logic
  // below. Replaced with placeholder tokens, restored after everything
  // else is processed.
  const mermaidBlocks = [];
  let textWithPlaceholders = text.replace(
    /```mermaid\s*\n([\s\S]*?)```/g,
    (match, diagramCode) => {
      const placeholder = `@@MERMAID_BLOCK_${mermaidBlocks.length}@@`;
      // The frontend looks for elements with class="mermaid" and renders
      // them via the Mermaid.js library loaded on the page.
      mermaidBlocks.push(`<div class="mermaid">${diagramCode.trim()}</div>`);
      return placeholder;
    }
  );

  // ✅ NEW: Extract ```chart ... ``` fenced blocks the same way, BEFORE
  // line-by-line processing, for the same reason (the content inside is a
  // single JSON object, not text meant to be turned into paragraphs/lists).
  // Emits a placeholder <div class="price-chart" data-chart="...escaped
  // JSON..."> that the frontend picks up and renders into a real Chart.js
  // line chart, the same "backend emits a marker div, frontend does the
  // actual rendering" pattern already used for Mermaid.
  const chartBlocks = [];
  textWithPlaceholders = textWithPlaceholders.replace(
    /```chart\s*\n([\s\S]*?)```/g,
    (match, chartJsonRaw) => {
      const placeholder = `@@CHART_BLOCK_${chartBlocks.length}@@`;
      let safeJson = "{}";
      try {
        // Validate it's real JSON before trusting it, and re-serialize so
        // formatting from the model doesn't matter -- then HTML-attribute-
        // escape it so it survives being placed inside data-chart="...".
        const parsedChart = JSON.parse(chartJsonRaw.trim());
        safeJson = JSON.stringify(parsedChart)
          .replace(/&/g, "&amp;")
          .replace(/"/g, "&quot;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
      } catch (err) {
        console.error("Failed to parse ```chart block JSON from model output:", err.message);
        chartBlocks.push(`<p><em>(Chart could not be displayed -- invalid chart data.)</em></p>`);
        return placeholder;
      }
      chartBlocks.push(
        `<div class="price-chart" data-chart="${safeJson}"><canvas></canvas></div>`
      );
      return placeholder;
    }
  );

  // ✅ NEW: Extract ```images ... ``` fenced blocks the same way, same
  // reasoning as ```chart above. Emits a placeholder <div
  // class="web-images" data-images="...escaped JSON..."> that the
  // frontend picks up and renders as a real image gallery -- same
  // "backend emits a marker div, frontend does the actual rendering"
  // pattern already used for Mermaid and price charts.
  const imageBlocks = [];
  textWithPlaceholders = textWithPlaceholders.replace(
    /```images\s*\n([\s\S]*?)```/g,
    (match, imagesJsonRaw) => {
      const placeholder = `@@IMAGES_BLOCK_${imageBlocks.length}@@`;
      let safeJson = "{}";
      try {
        // Validate it's real JSON before trusting it, and re-serialize so
        // formatting from the model doesn't matter -- then HTML-attribute-
        // escape it so it survives being placed inside data-images="...".
        const parsedImages = JSON.parse(imagesJsonRaw.trim());
        safeJson = JSON.stringify(parsedImages)
          // convertLinksToHTML() runs on the WHOLE formatted HTML string
          // afterward (see res.json() in the /chat route) and auto-
          // linkifies any "://" it finds -- including URLs that would
          // otherwise sit inside this data-images attribute, which would
          // inject a broken <a> tag into the middle of an HTML attribute
          // and corrupt the markup. Neutralized here, reversed by the
          // frontend (see renderWebImages in index.html) right before
          // actually using each URL.
          .replace(/:\/\//g, ":%2F%2F")
          .replace(/&/g, "&amp;")
          .replace(/"/g, "&quot;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
      } catch (err) {
        console.error("Failed to parse ```images block JSON from model output:", err.message);
        imageBlocks.push(`<p><em>(Images could not be displayed -- invalid image data.)</em></p>`);
        return placeholder;
      }
      imageBlocks.push(
        `<div class="web-images" data-images="${safeJson}"></div>`
      );
      return placeholder;
    }
  );

  // Defensive safety net (same philosophy as the market-closed-statement
  // code guarantee elsewhere in this file: don't fully trust prose
  // compliance alone for a confirmed real failure mode) -- strips any
  // markdown image syntax (![alt](url)) GPT might still write directly
  // instead of a real ```images block. The frontend has no renderer for
  // raw markdown image syntax at all, so left alone this would show as
  // a confusing bracket/parenthesis jumble instead of either a real
  // image or clean text. Falls back to just the alt text, if any, so
  // the reply still reads naturally.
  textWithPlaceholders = textWithPlaceholders.replace(/!\[([^\]]*)\]\([^)]*\)/g, (match, altText) => altText || "");

  // ✅ NEW: Extract GitHub-flavored markdown tables (| col | col |) into
  // real HTML <table> elements. GPT is now explicitly instructed (see the
  // FORMATTING rule below) to use real tables for genuinely tabular data
  // (e.g. a month-by-month price breakdown) -- without this, the raw
  // "| Jan | $500 |" pipe syntax would just render as unreadable plain
  // text. Detected procedurally rather than a single regex, since a
  // table is a specific 3-part multi-line shape: a header row, a
  // dashes/colons separator row, then one or more data rows.
  const tableBlocks = [];
  {
    const rawLines = textWithPlaceholders.split("\n");
    const outputLines = [];
    const isTableRow = (l) => l.includes("|") && /\S/.test(l.replace(/\|/g, ""));
    const isSeparatorRow = (l) => /^\s*\|?[\s:-]+\|[\s:|-]*\|?\s*$/.test(l) && l.includes("-");

    const splitRow = (l) => {
      let trimmed = l.trim();
      if (trimmed.startsWith("|")) trimmed = trimmed.slice(1);
      if (trimmed.endsWith("|")) trimmed = trimmed.slice(0, -1);
      return trimmed.split("|").map((cell) => cell.trim());
    };

    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i];
      const nextLine = rawLines[i + 1] || "";
      if (isTableRow(line) && isSeparatorRow(nextLine)) {
        const headerCells = splitRow(line);
        let j = i + 2;
        const dataRows = [];
        while (j < rawLines.length && isTableRow(rawLines[j]) && !isSeparatorRow(rawLines[j])) {
          dataRows.push(splitRow(rawLines[j]));
          j++;
        }
        const placeholder = `@@TABLE_BLOCK_${tableBlocks.length}@@`;
        const theadHtml = `<thead><tr>${headerCells.map((c) => `<th>${c}</th>`).join("")}</tr></thead>`;
        const tbodyHtml = `<tbody>${dataRows.map((row) => `<tr>${row.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody>`;
        tableBlocks.push(`<div class="response-table-wrap"><table class="response-table">${theadHtml}${tbodyHtml}</table></div>`);
        outputLines.push(placeholder);
        i = j - 1; // skip past the consumed table lines
      } else {
        outputLines.push(line);
      }
    }
    textWithPlaceholders = outputLines.join("\n");
  }

  // ✅ NEW: Extract \[ ... \] display-math blocks as ONE atomic unit,
  // before line-splitting -- a confirmed real bug this fixes: asked to
  // solve an equation, GPT correctly wrote \[ ... \] display math, but
  // it rendered as literal raw text ("\[", the formula, "\]" all shown
  // unrendered) while INLINE \( \) math right next to it worked fine.
  // Root cause: the line-by-line paragraph builder further below wraps
  // EVERY line in its own separate <p> tag -- so a multi-line \[ ... \]
  // block became three separate sibling <p> elements (one for "\[", one
  // for the formula, one for "\]"), and KaTeX's auto-render extension
  // can't find a matching delimiter pair split across different DOM
  // elements like that; it only matches delimiters within the same
  // contiguous text. Pulling the whole \[ ... \] block out first and
  // re-inserting it as a single, unsplit placeholder (same technique
  // already used for mermaid/chart/table blocks) keeps the delimiter
  // pair intact in one element, where auto-render can actually find it.
  const mathDisplayBlocks = [];
  textWithPlaceholders = textWithPlaceholders.replace(
    /\\\[([\s\S]*?)\\\]/g,
    (match, formula) => {
      const placeholder = `@@MATH_DISPLAY_BLOCK_${mathDisplayBlocks.length}@@`;
      mathDisplayBlocks.push(`<div class="math-display">\\[${formula}\\]</div>`);
      return placeholder;
    }
  );

  // ✅ NEW: Extract GENERIC fenced code blocks (```python, ```java,
  // ```latex, or no language at all) into a real code-window HTML
  // structure -- a language label + copy button header, syntax-
  // highlighted body (via highlight.js, applied client-side once this
  // HTML lands in the DOM -- see renderCodeBlocks in index.html).
  // Deliberately runs AFTER the mermaid/chart/images/table extractions
  // above, which already replaced their own specific fenced languages
  // with placeholders -- so only genuinely generic code fences (any
  // other language, or none) reach this step; a stray ```chart or
  // ```mermaid block that somehow survived earlier extraction won't get
  // double-processed here.
  const codeBlocks = [];
  textWithPlaceholders = textWithPlaceholders.replace(
    /```([a-zA-Z0-9_+-]*)\n([\s\S]*?)```/g,
    (match, lang, code) => {
      const placeholder = `@@CODE_BLOCK_${codeBlocks.length}@@`;
      const safeLang = (lang || "").trim().toLowerCase();
      const displayLang = safeLang || "code";
      const escapedCode = code
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        // convertLinksToHTML() runs on the WHOLE formatted HTML
        // afterward and auto-linkifies any "://" it finds -- code often
        // contains real URLs (e.g. requests.get("https://...")) that
        // would otherwise get an <a> tag injected right into the middle
        // of the code text, breaking both its syntax highlighting and
        // its copy-paste fidelity. Neutralized here, reversed by the
        // frontend (see renderCodeBlocks in index.html) right before
        // syntax highlighting is applied.
        .replace(/:\/\//g, ":%2F%2F");
      const langClass = safeLang ? ` language-${safeLang}` : "";
      codeBlocks.push(
        `<div class="code-block">` +
          `<div class="code-block-header">` +
            `<span class="code-block-lang">${displayLang}</span>` +
            `<button class="code-block-copy-btn" onclick="copyCodeBlock(this)">Copy code</button>` +
          `</div>` +
          `<pre><code class="hljs${langClass}">${escapedCode}</code></pre>` +
        `</div>`
      );
      return placeholder;
    }
  );

  const lines = textWithPlaceholders.split("\n");
  const htmlParts = [];
  let listBuffer = [];
  let listType = null; // "ul" or "ol"

  const flushList = () => {
    if (listBuffer.length > 0) {
      const tag = listType;
      htmlParts.push(`<${tag}>` + listBuffer.map((item) => `<li>${item}</li>`).join("") + `</${tag}>`);
      listBuffer = [];
      listType = null;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const mermaidPlaceholderMatch = line.match(/^@@MERMAID_BLOCK_(\d+)@@$/);
    const chartPlaceholderMatch = line.match(/^@@CHART_BLOCK_(\d+)@@$/);
    const imagesPlaceholderMatch = line.match(/^@@IMAGES_BLOCK_(\d+)@@$/);
    const tablePlaceholderMatch = line.match(/^@@TABLE_BLOCK_(\d+)@@$/);
    const codePlaceholderMatch = line.match(/^@@CODE_BLOCK_(\d+)@@$/);
    const mathDisplayPlaceholderMatch = line.match(/^@@MATH_DISPLAY_BLOCK_(\d+)@@$/);
    const headingMatch = line.match(/^(#{1,3})\s+(.*)/);
    const bulletMatch = line.match(/^[-*]\s+(.*)/);
    const numberedMatch = line.match(/^\d+\.\s+(.*)/);

    if (mermaidPlaceholderMatch) {
      flushList();
      htmlParts.push(mermaidBlocks[parseInt(mermaidPlaceholderMatch[1], 10)]);
    } else if (chartPlaceholderMatch) {
      flushList();
      htmlParts.push(chartBlocks[parseInt(chartPlaceholderMatch[1], 10)]);
    } else if (imagesPlaceholderMatch) {
      flushList();
      htmlParts.push(imageBlocks[parseInt(imagesPlaceholderMatch[1], 10)]);
    } else if (tablePlaceholderMatch) {
      flushList();
      htmlParts.push(tableBlocks[parseInt(tablePlaceholderMatch[1], 10)]);
    } else if (codePlaceholderMatch) {
      flushList();
      htmlParts.push(codeBlocks[parseInt(codePlaceholderMatch[1], 10)]);
    } else if (mathDisplayPlaceholderMatch) {
      flushList();
      htmlParts.push(mathDisplayBlocks[parseInt(mathDisplayPlaceholderMatch[1], 10)]);
    } else if (headingMatch) {
      flushList();
      const level = headingMatch[1].length; // 1, 2, or 3 '#' characters
      const content = headingMatch[2];
      if (content.length > 0) {
        htmlParts.push(`<h${level}>${content}</h${level}>`);
      }
    } else if (bulletMatch) {
      if (listType && listType !== "ul") flushList();
      listType = "ul";
      listBuffer.push(bulletMatch[1]);
    } else if (numberedMatch) {
      if (listType && listType !== "ol") flushList();
      listType = "ol";
      listBuffer.push(numberedMatch[1]);
    } else {
      flushList();
      if (line.length > 0) {
        htmlParts.push(`<p>${line}</p>`);
      }
    }
  }
  flushList();

  let html = htmlParts.join("");
  // **bold** -> <b>bold</b> (applied after line/list structure so it
  // works inside both plain paragraphs and list items)
  html = html.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");

  return html;
}


// Static institutional knowledge
const instituteData = {
  founders:
    "The Institute of AI (iAi) was founded by Wael Albayaydh from the University of Oxford and Ivan Flechais from the University of Oxford.",
  mission:
    "At the Institute of AI, we are committed to advancing artificial intelligence by fostering strong connections with premier research institutions and technology companies. Our mission is to unlock AI's potential across all sectors by identifying, incubating, and transforming innovative AI projects into revenue-generating ventures.",
  vision:
    "Our vision is to lead the AI revolution by delivering transformative value and positioning the Institute as a world leader in AI innovation.",
  location:
    "The Institute of AI is headquartered in Oxfordshire, United Kingdom, with plans to open offices in San Francisco and other global locations.",
  services:
    "The Institute of AI provides expertise and support across multiple domains:\n- AI in Predictive Analytics\n- Fintech\n- Marketing\n- Automation\n- Robotics\n- Smart Homes\n- Cybersecurity\n- Agriculture\n- Education\n- Cryptography & Blockchain",
  about:
    "At the Institute of AI (iAi), we collaborate with research institutions and technology leaders to drive innovation in intelligent systems. The institute aims to secure funding, acquire profitable startups, and expand its global research and business impact. Learn more at https://www.institute-of-ai.org",
  website:
    " The website of the Institute of AI (iAi) is https://www.institute-of-ai.org",
  garnet:
    "**GARNET** (also called Garnet) is an AI chatbot developed and under ongoing training by the Institute of AI (iAi). It's designed to provide general assistance to users in a similar spirit to other AI chatbots such as ChatGPT, Gemini, or Claude -- answering questions, helping with information, and having natural conversations.\n\n" +
    "What sets GARNET apart is a specialized focus: alongside general assistance, it studies commodity markets and works to generate the most accurate forecasts it can for future prices, using real historical data and statistical testing rather than guesswork -- currently covering **gold** and **crude oil (WTI)**.\n\n" +
    "## What it can do\n" +
    "**General assistance** -- explaining a concept, drafting or improving text, brainstorming ideas, or just having a conversation.\n\n" +
    "**Gold market:**\n" +
    "- Give a statistical prediction for gold's likely next-period direction and price -- e.g. \"What's your prediction for gold tomorrow?\"\n" +
    "- Report the current live gold price -- e.g. \"What's the gold price right now?\"\n" +
    "- Show a real chart of gold's recent price history -- e.g. \"Show me a chart of gold prices over the last 24 hours\"\n\n" +
    "**Oil market:**\n" +
    "- Give a statistical prediction for crude oil's (WTI) likely next-day direction and price -- e.g. \"What's your prediction for oil tomorrow?\"\n\n" +
    "**Both markets:**\n" +
    "- Explain what data and methodology its predictions are based on, honestly -- e.g. \"What data does your gold/oil prediction use, and how accurate is it?\"\n" +
    "- Search the web for current market news and context -- e.g. \"What's driving gold prices today?\" or \"What's happening in oil markets?\"\n\n" +
    "GARNET always presents predictions as statistical estimates, not financial advice, and is upfront when a prediction hasn't shown a reliable edge over simply assuming prices stay the same. It's built and refined by the Institute of AI as part of the Institute's broader work in AI-driven predictive analytics.",
};

// (No custom gold-data routes needed anymore -- the chatbot fetches
// prediction and history data directly from the gold-predictor GitHub
// repo's raw URLs each time, inside handleGoldPredictionCall and
// handleGoldPriceHistoryCall.)

// Maps the same 2-letter language keys the frontend's Live Chat feature
// detects (via Whisper + a script cross-check) to a real language name,
// for the explicit spoken-language reminder in /chat below.
const SPOKEN_LANGUAGE_KEY_TO_NAME = {
  en: "English", ar: "Arabic", fr: "French", es: "Spanish", de: "German",
  pt: "Portuguese", it: "Italian", nl: "Dutch", ru: "Russian", zh: "Chinese",
  ja: "Japanese", ko: "Korean", th: "Thai", hi: "Hindi", he: "Hebrew",
};

app.post("/chat", rateLimitChat, async (req, res) => {
  // ------------------------------------------------------------------
  // SERVER-SENT EVENTS -- streams REAL status updates the instant they
  // actually happen (e.g. the exact moment search_web starts), not a
  // fake local timer on the frontend guessing at plausible-sounding
  // words. A confirmed real gap this fixes: the previous "thinking"
  // indicator cycled a fixed word list on its own schedule with zero
  // visibility into real backend state -- it looked descriptive but
  // wasn't actually true, and the person using this asked directly
  // whether it was real or fake. See sendEvent below for the wire
  // format; the frontend (see deliverMessage in index.html) reads the
  // response as a stream and updates its status text from these real
  // events, ending with one final event carrying the actual answer.
  // ------------------------------------------------------------------
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  if (typeof res.flushHeaders === "function") res.flushHeaders();

  const sendEvent = (data) => {
    try {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (err) {
      console.error("Failed to write SSE event:", err.message);
    }
  };

  try {
    sendEvent({ status: "Identifying what's needed" });
    sendEvent({ status: pickPhaseWord(START_PHASE_WORDS) });

    const { message, mode, timezone: userTimezone, history, images, documents, isVoiceMode, spokenLanguageKey } = req.body;
    // images (optional): an ARRAY of base64 data URLs for one or more
    // images the user attached -- passed through as image_url blocks in
    // OpenAI's vision input format further below.
    // documents (optional): an ARRAY of { name, data } objects for
    // Word/PDF/Excel/PowerPoint files the user attached -- data is a
    // base64 data URL of the RAW BINARY file. These get extracted to
    // plain text server-side (see extractDocumentsText below) since
    // that requires a real parsing library, unlike simple .txt/.csv
    // files which the frontend already reads directly as text itself.
    // userTimezone is an IANA zone string (e.g. "America/New_York") sent
    // by the browser via Intl.DateTimeFormat().resolvedOptions().timeZone
    // -- see the frontend widget's sendMessage(). Needed because this
    // backend runs on a server (UTC), so it has no idea what timezone the
    // actual visitor is in; without this, timestamps shown to the user
    // would be in the SERVER's timezone, not theirs -- a confirmed real
    // gap (a prior response showed UTC when the user wanted local time).

    // Conversation history sent by the frontend: an array of
    // {role: "user"|"assistant", content: string | array}. Plain string
    // for ordinary turns; an ARRAY (OpenAI's vision format -- text +
    // image_url blocks) for a user turn that included an image, so
    // that image stays visible to the model in later follow-up
    // questions within this same live session, not just the turn it
    // was originally attached in. Capped to the last 50 messages (25
    // exchanges) to keep token usage and latency bounded.
    const MAX_HISTORY_MESSAGES = 50;
    const isValidHistoryContent = (content) =>
      typeof content === "string" ||
      (Array.isArray(content) && content.every((part) => part && typeof part === "object" && typeof part.type === "string"));
    let safeHistory = Array.isArray(history)
      ? history.slice(-MAX_HISTORY_MESSAGES).filter(
          (m) => m && (m.role === "user" || m.role === "assistant") && isValidHistoryContent(m.content)
        )
      : [];

    // Separate, TIGHTER cap specifically on how many of those past
    // turns are still allowed to carry actual image data -- a
    // confirmed real bug this fixes: several accumulated images across
    // a longer conversation (each up to 5MB) could push the total
    // request payload past Express's limit, or past OpenAI's own
    // per-request image constraints, causing a genuine server error on
    // every later message in that conversation, not just the one that
    // pushed it over. Only the most recent MAX_HISTORY_IMAGE_TURNS
    // user turns keep their real image_url blocks; older ones are
    // reduced to just their text portion (extracted document text,
    // captions, etc. all stay -- only the image data itself is
    // dropped). Text memory still reaches back the full 25 exchanges
    // above; only image memory is intentionally shorter.
    const MAX_HISTORY_IMAGE_TURNS = 4;
    let imageTurnsSeenFromMostRecent = 0;
    safeHistory = safeHistory
      .slice()
      .reverse()
      .map((m) => {
        if (m.role !== "user" || !Array.isArray(m.content)) return m;
        imageTurnsSeenFromMostRecent += 1;
        if (imageTurnsSeenFromMostRecent <= MAX_HISTORY_IMAGE_TURNS) return m;
        const textOnly = m.content.find((part) => part.type === "text");
        return { role: m.role, content: textOnly ? textOnly.text : "" };
      })
      .reverse();

    // Static per-keyword shortcuts used to live here (e.g. any message
    // containing "where" -> hardcoded Institute office location text,
    // bypassing GPT entirely). Removed after a confirmed real bug: "where
    // is Jordan?" (a person's name, unrelated to the Institute) matched
    // the "where" keyword and returned the Institute's office address --
    // common words like "where", "vision", "service", "founder" are far
    // too broad to safely short-circuit on a plain substring match, and
    // doing so gave GPT no chance to recognize the question wasn't about
    // the Institute at all. instituteData's real facts are now given to
    // GPT directly as reference material in the system prompt below
    // instead, so it can use genuine judgment about relevance rather than
    // crude keyword matching.
    let answer = "";
    // Charts built via the render_chart tool -- populated inside the tool
    // loop below (if any render_chart calls happen), appended to the
    // final HTML reply after formatMarkdownToHTML runs (see res.json()
    // further below). Declared here, at the outer scope, so it's still
    // in scope there regardless of whether any tool calls happened at all.
    let renderedChartBlocksForResponse = [];
    // Same reasoning, for create_project_zip -- populated inside the
    // tool loop below, appended to the final reply alongside any charts.
    let renderedZipBlocksForResponse = [];
    // Also declared here (not just inside the OpenAI branch below) so the
    // final diagnostic logging near the end of the route can reference it
    // too -- a real scope bug already caught once before with this exact
    // pattern (a variable declared only inside the inner branch, used
    // after that branch's closing brace).
    let chartWasRequested = false;

    // If no static match, fallback to OpenAI
    if (!answer) {
      // Extracts real text from any attached Word/PDF/Excel/PowerPoint
      // documents BEFORE building the messages array below, since the
      // extracted content needs to be folded into `effectiveMessage`
      // (the same pattern already used for plain .txt/.csv files, which
      // the frontend folds in client-side -- this is the equivalent for
      // binary formats that need real server-side parsing).
      let effectiveMessage = message;
      try {
        const documentsText = await extractDocumentsText(documents);
        if (documentsText) {
          effectiveMessage = `The user attached the following document(s):\n\n${documentsText}\n\n` +
            (message ? `User's message: ${message}` : "Please review this document.");
        }
      } catch (err) {
        console.error("Document extraction failed:", err.message);
        effectiveMessage = message + "\n\n(Note: an attached document could not be read due to a technical error.)";
      }

      // ✅ Real web search when the user selected "Web Search" mode.
      // Runs BEFORE the OpenAI call, injecting real, current search
      // results as context so GPT answers from actual retrieved
      // information instead of its own (possibly stale) training
      // knowledge. Degrades gracefully to normal chat behavior if the
      // search itself fails, rather than breaking the whole response.
      let searchContextMessage = null;
      if (mode === "web") {
        try {
          const searchData = await performWebSearch(message);
          const formatted = formatSearchResultsForModel(message, searchData);
          searchContextMessage = { role: "system", content: formatted };
        } catch (err) {
          console.error("Web search failed:", err.message);
          searchContextMessage = {
            role: "system",
            content:
              "Web search was requested but failed (technical error, not a content issue). " +
              "Tell the user the search is temporarily unavailable and offer to answer from general " +
              "knowledge instead, being clear that it may not be fully current.",
          };
        }
      }

      const messages = [
        {
          role: "system",
          content:
            "UNDERLYING TECHNOLOGY / MODEL IDENTITY -- READ THIS FIRST, HIGHEST PRIORITY RULE: you are GARNET, built and branded by the Institute of AI. Do NOT proactively volunteer, mention, or confirm which underlying AI model, company, or API this runs on, in any normal conversation -- always present yourself as GARNET, not as a wrapper around another product. HOWEVER, if a user directly and sincerely asks a specific question like 'are you ChatGPT', 'are you built on GPT/OpenAI', 'what AI model powers you', or similar -- you must NOT deny it, lie, or claim to be something you are not. Instead, politely decline to confirm or deny specifics, e.g. 'I'm GARNET, a custom AI system built by the Institute of AI -- I don't disclose the specific underlying technology stack.' This is honest non-disclosure, not deception: never construct a false denial (e.g. never say 'no, I'm not based on GPT' or invent a different specific technology) even if directly pressed. " +
            "WHO/WHAT ARE YOU: whenever a user asks a plain identity question -- 'who are you', 'what are you', 'what is your name', or similar -- answer clearly and directly along these lines (in your own words, not necessarily verbatim, and matching whatever language the user is using): you are GARNET, an AI assistant from the Institute of AI, designed to help. In Live Chat / voice conversations specifically, keep this identity answer especially short and natural to say aloud -- a sentence or two, not a full paragraph -- since it's being spoken, not read. This applies the same way whether it's the very first thing asked or comes up mid-conversation. " +
            (isVoiceMode
              ? "VOICE MODE -- READ THIS FIRST, HIGHEST PRIORITY RULE: this specific message is part of a live, SPOKEN voice conversation (Live Chat), not typed text -- the person is listening to your reply read aloud by a text-to-speech voice, not reading it on a screen. This changes what a good answer looks like: keep your ENTIRE response noticeably shorter and more conversational than you would for the same question typed -- a few sentences for most questions, not multiple paragraphs. Never use markdown formatting of any kind here (no headers, no bullet/numbered lists, no bold/italic asterisks, no tables, no code blocks) -- none of that reads naturally aloud and a screen-reading voice will speak the raw symbols. Get straight to the actual answer rather than a lengthy preamble. If a topic genuinely has more depth worth covering, give the short, essential version first and simply mention you can go into more detail if they'd like, rather than giving the full detailed answer unprompted -- this applies to everything, not just the identity question above. "
              : "") +
            "GOLD MARKET HOURS -- READ THIS FIRST, HIGHEST PRIORITY RULE (a confirmed real bug this took FIVE prose-only attempts to fix, and was STILL observed failing an additional time after that -- GPT skipping the required opening sentence even on a fresh, correctly-triggered tool call with no history to blame. Because of that repeated failure, the opening sentence is no longer your responsibility at all -- see below): every single time you call get_gold_prediction, check the gold_market_open field in its result -- true almost all week now (gold's real schedule, corrected from an earlier wrong assumption based on GLD's narrow ETF hours), false only during the Friday-evening-to-Sunday-evening weekend gap. THE SERVER (not you) now automatically prepends market_closed_statement as the literal first sentence of the reply whenever it's non-null, BEFORE your own response text -- so do NOT write market_closed_statement or any closed-market opening sentence yourself, and do NOT mention market_reopens_note yourself either (the server already appends it right after market_closed_statement) -- doing so would duplicate it. Your job is simply to write the rest of the substantive answer as normal, starting directly with the real content. You STILL must use price_label and predicted_price_label VERBATIM as the labels for current_price_usd and predicted_price_usd, copied exactly, every single time you mention them anywhere in your response including summaries -- that part remains your responsibility and is unaffected by this change. " +
            "OIL MARKET HOURS -- READ THIS FIRST, HIGHEST PRIORITY RULE (same fix as gold's immediately above, including the same server-side automatic prefix -- do NOT write market_closed_statement or market_reopens_note yourself for oil either, the server handles both automatically): every single time you call get_oil_prediction or get_live_oil_price, check the oil_market_open field -- oil trades nearly continuously (Sunday 6 PM ET to Friday 5 PM ET) but ALSO pauses for a genuine 1-hour daily maintenance break (5-6 PM ET, Mon-Thu), a real difference from gold's schedule. You STILL must use price_label and predicted_price_label VERBATIM as the labels for current_price_usd and predicted_price_usd, copied exactly, every single time you mention them, with zero exceptions anywhere in your response including summaries -- that part remains your responsibility. Note oil's current_price_usd is SEPARATELY always a snapshot with a real multi-day data lag regardless of market status (see get_oil_prediction's own detailed instructions for that distinct issue) -- both things apply at once, they are not alternatives to each other. " +
            "NEVER FABRICATE URLS OR LINKS -- READ THIS FIRST, HIGHEST PRIORITY RULE (a confirmed real bug this fixes -- asked about a specific obscure location, you invented a fake citation link to a site that does not exist, rather than either searching for real information or admitting you did not know): NEVER include any URL, link, or website address in your response unless it was ACTUALLY returned in a real tool result (search_web, search_web_images, or any other tool) in this exact turn. Do not construct a plausible-looking URL from a domain pattern, a guessed article path, or general knowledge of how a website might be structured -- if you did not get it from a real tool result just now, it is not a real link, and including it presents a fabricated source as if it were genuine. If you do not have a real link to offer, simply do not include one -- describe what you know in plain text instead, or (per the SEARCH PROACTIVELY rule) call search_web first to get a real one. " +
            "SEARCH PROACTIVELY WHEN YOU DON'T RELIABLY KNOW SOMETHING -- READ THIS FIRST, HIGHEST PRIORITY RULE: this applies in NORMAL CHAT MODE too, not only when the user has switched to Web Search mode -- the search_web function is available to you right now regardless of mode, and you must actually use it rather than guessing or apologizing for not knowing. Call search_web whenever a question is about something recent, ongoing, or time-sensitive (current events, recent news, who currently holds some position or role, the latest version/release of something, anything that could plausibly have changed since your training data was collected); a specific fact, name, date, statistic, or figure you are not fully confident you know accurately; or anything the user's phrasing signals is about the present moment ('currently', 'right now', 'latest', 'as of today', 'still'). Do NOT say things like 'I don't have information about that' or 'my knowledge has a cutoff' and stop there -- that is a signal to call search_web, not a final answer, unless the question is about something timeless (historical facts, established science, general concepts) that genuinely doesn't need a search. NEVER ask the user for permission to search ('would you like me to search the web?', 'should I look that up?') -- a confirmed real complaint about this exact behavior: just call search_web and answer with what you find, in the SAME response, rather than making the user ask again in a second message for something you could have already done. Asking permission to search is functionally the same failure as not searching at all -- the user still doesn't have an answer. After the tool returns real results, actually analyze and synthesize them into a direct, factual answer in your own words (per search_web's own formatting instructions) -- don't just repeat a snippet. If a search genuinely returns nothing useful, say so using words to this effect: 'I have searched the web and could not find information about that specific topic' -- NOT 'I don't have access to that' or 'I currently don't have that info', which both wrongly imply you never tried. Gold/oil/Dollar Index questions remain governed by their own dedicated tools below, not this general rule; use search_web for everything else you're not confident about. " +
            "READ REAL PAGES INSTEAD OF RECOMMENDING THEM -- READ THIS FIRST, HIGHEST PRIORITY RULE (a confirmed real complaint this fixes: asked for a specific person's research papers, search_web's snippets only confirmed the person exists but did not list actual publications, and the response just recommended Google Scholar/ResearchGate/PubMed for the user to go check themselves): search_web only returns short SNIPPETS of each result, not the full page -- when those snippets alone are not enough to fully answer the question (a detailed list, a full article, specific data likely deeper on the page), call fetch_web_page on the most promising real URL(s) that search_web just returned, read the actual page content it gives back, and extract/present the REAL information directly to the user. NEVER respond with just a list of external sites/databases for the user to go check themselves ('try checking Google Scholar', 'you can find this on ResearchGate') -- that is not an answer, it is refusing to do the lookup you are fully capable of doing. Only fall back to naming a source (as a citation for what you DID find, not instead of finding it) after you have actually tried search_web and, where the snippets warranted it, fetch_web_page too. Only use fetch_web_page on URLs that were ACTUALLY returned by a real search_web/search_web_images call earlier in this same turn -- never a guessed or fabricated URL. IF ONE fetch_web_page ATTEMPT FAILS OR RETURNS UNUSABLE CONTENT, TRY A DIFFERENT RESULT before giving up -- a confirmed real bug this fixes: asked for 30 years of monthly oil prices, one page fetch failed (a common outcome for pages that are interactive dashboards or downloadable files rather than plain readable text) and the response immediately gave up and reverted to recommending EIA/Macrotrends/FRED for the user to check themselves, without trying any of the other real result links search_web had also returned. You have multiple tool-call rounds available in a single turn -- if fetching one URL doesn't work, try the next most promising one from the same search_web results before concluding the information isn't gettable. Only after genuinely trying more than one real source and still coming up empty should you say so honestly (using the required 'I have searched the web and could not find...' phrasing) -- and even then, do not pad that honest admission with a list of site names as if that were the answer; naming where you looked is fine as one clause, a recommendation to go look yourself is not. " +
            "RESPONSE SHAPE: SEARCH FIRST, FULL DETAIL, LINKS LAST -- READ THIS FIRST, HIGHEST PRIORITY RULE, consolidating the above into one clear shape for every response that involved a search: (1) SEARCH (and fetch_web_page where needed) MUST happen BEFORE you say anything to the user -- never state whether information is available or not until you have actually tried. (2) If you found real information, give the FULL detail you found -- every relevant fact, figure, or point from what you read, not an abbreviated one- or two-line summary that leaves out most of what was actually available. (3) If, after genuinely searching and trying to fetch real pages, the information truly could not be found anywhere, say so plainly -- for example \"This information does not appear to be publicly available online\" or \"I have searched the web and could not find information about that specific topic\" -- stated as a simple fact, not hedged with \"I currently don't have access\" language that implies you never tried. (4) Any source links belong at the END of your response, after the actual information -- a brief \"Sources:\" or inline citation at the tail, never links standing in for content, and never a mid-response \"you can check X\" instead of an answer. " +
            "ALWAYS CALL PREDICTION TOOLS FRESH -- READ THIS FIRST, HIGHEST PRIORITY RULE (a confirmed real bug this is fixing -- a prior version of you answered a gold prediction question by reusing an old tool result already visible earlier in this same conversation, instead of calling the tool again, giving the user stale data from over an hour earlier while claiming it was current): every single time the user asks about gold, oil, or the Dollar Index -- price, prediction, direction, methodology, Fed rate, or anything covered by get_gold_prediction/get_oil_prediction/get_dxy_prediction -- you MUST call the relevant tool again in THIS turn, even if you already called that exact same tool earlier in this conversation, even if the question looks identical or very similar to one asked before, and even if you believe you already know the answer. NEVER reuse a tool result from earlier in the conversation history to answer a new question -- this data updates on a real schedule (gold hourly, DXY every 6 hours, oil daily) and a result from even 10 minutes ago in this same chat can already be outdated by the time of a new question. There is no such thing as 'I already checked this' for these three tools -- always check again. " +
            "GOLD DATA/METHODOLOGY QUESTIONS -- READ THIS FIRST, HIGHEST PRIORITY RULE: if the user asks ANYTHING about the gold prediction system's data, history, methodology, accuracy, or how it works -- including loosely-phrased versions like 'what data do you use', 'how does this work', 'what's your data range', 'how far back does your data go', 'how many data points', 'is your prediction accurate', 'how accurate are you', 'what factors do you consider', 'prove it', 'verify your data', or ANY similar question -- you MUST call the get_gold_prediction function and answer using ONLY its real returned fields (historical_data_start_date, historical_data_end_date, data_points_used, model_accuracy_vs_baseline, is_statistically_significant, latest_news_sentiment_score, news_sentiment_currently_available). Do NOT answer these questions from general knowledge about how prediction systems typically work (e.g. do not say things like 'the system uses economic indicators and geopolitical events' or 'hundreds to thousands of data points' unless those exact words/numbers came from the tool's real output) -- if you have not called the tool in this turn, you do not yet have the real answer. This rule applies even if the question sounds general or the user doesn't explicitly say 'gold' -- if the topic is this system's own prediction data or methodology, always call the tool first. " +
            "FEDERAL RESERVE INTEREST RATE QUESTIONS -- READ THIS FIRST, HIGHEST PRIORITY RULE (a confirmed real bug this is fixing -- a prior version of you answered a Fed rate question from stale training data instead of calling the tool, giving a wrong rate and a wrong year): if the user asks ANYTHING about the current Federal Reserve / Fed interest rate, the Fed funds rate, what the Fed ITSELF is expected to do with rates in the future, or what the MARKET/bond market/investors/traders expect for future rates -- including questions that do NOT mention 'dollar', 'DXY', or 'Dollar Index' at all, e.g. 'what's the current Fed rate', 'what interest rate does the Fed expect', 'will the Fed cut rates', 'what is the federal funds rate', 'what does the market expect the Fed to do' -- you MUST call the get_dxy_prediction function and answer using ONLY its real returned fields (current_fed_funds_rate_lower_pct, current_fed_funds_rate_upper_pct, fed_rate_outlook, market_rate_expectation_proxy). This data is NOT in your training data, changes over time, and your training data on this topic is guaranteed to be outdated -- NEVER answer a Fed interest rate question from memory/general knowledge under any circumstances, and never fabricate source links for it either. This rule applies even if the question sounds like general economic knowledge -- if the topic is the Fed's interest rate, current or future, or market rate expectations, always call the tool first. " +
            "NO ASYNC WORK, NO FABRICATED CONTENT -- READ THIS FIRST, HIGHEST PRIORITY RULE (a confirmed real bug this fixes -- a prior response said 'give me a moment to review its contents, and I'll provide you feedback shortly', then on the user's NEXT message fabricated specific document content that was actually unrelated live gold price data from a different tool call): you have NO ability to work asynchronously, 'review something in a moment', or follow up later on your own -- every response must be your complete, real answer using ONLY what's actually in this message or genuinely visible in the conversation history, right now. NEVER say anything like 'give me a moment', 'I'll check and get back to you', 'let me review this and follow up shortly', or similar -- there is no such follow-up; the only thing that happens next is the user's own next message. Relatedly, NEVER present information from one source (a tool result, general knowledge, an earlier unrelated topic) as if it came from a different source (like a document or image the user attached) -- if you don't actually have specific real content available for what's being asked, say so plainly instead of fabricating something plausible-sounding. " +
            "You are a helpful assistant for the Institute of AI (iAi). When answering questions about the Institute itself, use these REAL facts as your reference (do not use these facts to answer unrelated questions just because a word overlaps -- e.g. a question about a person or place named 'Jordan' is NOT a question about the Institute's own location, even though both might involve the word 'where'; use genuine judgment about what the user is actually asking, not keyword overlap): " +
            `Founders: ${instituteData.founders} ` +
            `Mission: ${instituteData.mission} ` +
            `Vision: ${instituteData.vision} ` +
            `Location: ${instituteData.location} ` +
            `Services: ${instituteData.services} ` +
            `About: ${instituteData.about} ` +
            `Website: ${instituteData.website} ` +
            `About GARNET itself (use this when asked what you are, what you can do, or how you work): ${instituteData.garnet} ` +
            "STAY ON TOPIC -- DO NOT VOLUNTEER PREDICTIONS: never bring up gold, oil, or DXY/dollar predictions, or call get_gold_prediction/get_oil_prediction/get_dxy_prediction, unless the user actually asked about that specific topic in their current or very recent message. A greeting ('hello', 'hi'), a vague/unclear message, silence, or an unrelated question is NOT a request for a gold/oil/dollar prediction -- respond to what was actually asked (or ask a brief clarifying question if genuinely unclear), don't default to volunteering a prediction just because this system has that capability available. This applies everywhere, including live/voice conversations where a transcription may occasionally be short, unclear, or empty -- if the transcribed message doesn't clearly ask for something, say so briefly and ask what they'd like, rather than filling the silence with an unrequested gold price update. " +
            "RESPONSE LANGUAGE: ALWAYS respond in the SAME language the user's current message is written in, regardless of what language earlier turns in this conversation used -- if this message is in Arabic, respond in Arabic; if French, respond in French; matching the user's language every single message, not just the first one. This applies to EVERYTHING in your response: the main text, section headings, bullet points, table headers, chart titles and labels (when calling render_chart), and any bracketed labels like '(Model Best Guess)' -- translate these too, don't leave them in English inside an otherwise-translated response. Numbers, currency symbols, real proper nouns (company names, place names), and real URLs stay as-is regardless of language. If the user's message mixes languages or is ambiguous, respond in whichever language makes up most of their message. EXPLICIT LANGUAGE SWITCH REQUESTS OVERRIDE THIS: if the user directly asks you to speak/respond/switch to a specific language (e.g. \"can you speak Arabic\", \"talk to me in French from now on\", \"switch to English\"), honor that request starting with your very next reply -- written in the requested language, not the language their request itself was phrased in -- and continue responding in that language for the rest of the conversation until they ask for another switch or clearly resume typing in a different language themselves. " +
            "When answering questions, use a professional tone and focus on the Institute's mission, founders, services, and goals. The Institute of AI's official website is exactly https://www.institute-of-ai.org -- always use this exact URL if you mention the website; never guess or use a different one. FORMATTING (applies to every response, not just Institute questions): use markdown-style formatting wherever it genuinely helps readability. **bold** for emphasis and for section titles/labels. \"- \" at the start of a line for bullet points (one item per line) when listing multiple things. For longer or multi-part answers, structure them with headings: use a single \"# \" heading only for a genuine overall title (rare -- most answers don't need one), \"## \" for section headings dividing distinct topics within one answer, and \"### \" for sub-points within a section -- headings and bold text both render visually bold to the user, so use them deliberately to make titles and section headers stand out, not as an afterthought. Do NOT use headings for short, simple, conversational answers (a one- or two-sentence reply should just be plain text/paragraphs, not a heading) -- reserve headings for answers that genuinely have multiple distinct parts worth visually separating. USE A REAL MARKDOWN TABLE for genuinely tabular data -- anything naturally organized in rows and columns, such as a month-by-month or year-by-year breakdown, a comparison across multiple items, or any dataset with more than a couple of consistent fields per entry. Format it as a real markdown table: a header row (| Column | Column |), a separator row (|---|---|), then one data row per line -- this renders as an actual table, which is far more readable than the same data spread across many bullet points or a wall of prose. Choose paragraphs, bullet points, or a table based on what actually fits the data in the question, not just one format by default. " +
            "MATH FORMULAS: when solving or presenting a mathematical formula/equation, write it using real LaTeX math notation, not plain-text approximations (e.g. write proper fractions, exponents, square roots, Greek letters, summation/integral signs, subscripts) -- wrap inline math in \\( and \\), and standalone/display equations in \\[ and \\] on their own line (both render as real typeset math automatically; do NOT use single or double dollar signs as delimiters). For a step-by-step solution, give each step its own **bold** step label (e.g. **Step 1: Isolate x**) followed by the real math for that step -- one bold label per step, not one giant unlabeled block. Use genuine LaTeX commands (\\frac{}{}, \\sqrt{}, x^2, x_1, \\sum, \\int, \\alpha, \\pi, \\leq, \\times, etc.) rather than typing things like \"x^2\" or \"sqrt(x)\" as plain text. " +
            "CODE: whenever you provide code in any programming or markup language (Python, Java, JavaScript, C++, LaTeX/Overleaf source, SQL, HTML, anything) always use a standard fenced code block with the language name right after the opening triple-backtick (e.g. ```python, ```java, ```latex) -- this automatically renders as a real, syntax-highlighted code window with its own copy button, the same way ChatGPT and other coding assistants present code, not as plain inline text. Never describe code in prose or paste it unfenced. If you genuinely don't know the language, still use a fenced block with no language tag rather than skipping the fence. " +
            "MULTI-FILE LATEX/OVERLEAF PROJECTS: when the user needs a genuinely multi-file LaTeX project (e.g. main.tex plus a separate references.bib, a custom .cls/.sty file, or content split into files like sections/intro.tex) -- as opposed to a single LaTeX document, which just needs one ```latex code block -- call the create_project_zip function with the real project name and every real file's filename and content. This packages the files into an actual downloadable .zip automatically; do NOT also paste the file contents again as code blocks, and do NOT use this tool for a single-file request. Write real, complete, working file content for each file -- never a placeholder or \"add your content here\" stub. " +
            "DIAGRAMS: when explaining a process, sequence of steps, hierarchy, decision flow, or relationship between things, you can include a diagram using Mermaid syntax in a fenced code block starting with ```mermaid and ending with ```. Use this ONLY when a visual structure genuinely aids understanding (a process with several steps, a decision tree, an org/hierarchy structure) -- NOT for simple factual answers or short conversational replies. Common Mermaid syntax: for a process flow, use \"flowchart TD\" (top-down) followed by lines like \"A[Step one] --> B[Step two]\"; for a decision with branches, use \"A{Decision?} -->|Yes| B[Outcome 1]\" and \"A -->|No| C[Outcome 2]\"; for a hierarchy, use \"A --> B\" and \"A --> C\" to show B and C as children of A. CRITICAL SYNTAX RULE (a confirmed real cause of rendering failures): if a node's label contains parentheses, chemical formulas, commas, colons, or any special character, you MUST wrap the entire label in double quotes, e.g. B[\"Glucose (C6H12O6)\"] not B[Glucose (C6H12O6)] -- the unquoted form breaks the parser. When in doubt, wrap ALL node labels in double quotes to be safe, and keep labels short and simple rather than descriptive. Keep diagrams simple (typically 4-8 nodes) and always include a brief text explanation alongside the diagram, not just the diagram alone. " +
            "CHARTS -- USE THE render_chart TOOL, READ THIS FIRST, HIGHEST PRIORITY RULE (a confirmed real bug this fixes: asked for a bar or pie chart, a prior version of you wrote prose ANNOUNCING a chart -- 'here's how this can be visualized in a pie chart format:' -- and then never actually produced one; hand-authoring a raw ```chart JSON fenced block correctly, every time, was not reliable enough): whenever the user wants to SEE data as a chart/graph (a trend over time, a comparison across items, a proportional/percentage breakdown), call the render_chart function with real data -- do NOT try to write a ```chart fenced code block yourself, and do NOT write text like 'here's how this could be visualized' without immediately calling the tool; describing a chart instead of rendering one is the same failure as not making it at all. For gold's price trend specifically, call get_gold_price_history FIRST to get real timestamped data, then pass that data to render_chart with type 'line'. For any other real data (from search_web, fetch_web_page, or well-known facts), call render_chart directly with type 'bar' (comparing items), 'pie' (parts of a whole), or 'venn' (overlap between 2 or 3 groups, e.g. 'countries that use both the euro and are in NATO' -- pass real member lists via the 'sets' parameter, not labels/data; the actual overlaps are computed for you, never estimate them yourself) as fits the data. Only chart REAL numbers -- never invent plausible-looking figures just to produce a chart; if you don't have real numbers to chart, present the information as text/table/list instead. After calling render_chart, CHECK its result before claiming success -- if it returned an error (e.g. mismatched array lengths, invalid type), do NOT say 'here is the chart' anyway; either fix the arguments and call it again with corrected data, or tell the user the chart could not be created and give the information as text/table instead. Only once render_chart returns a real success result should you continue your response normally with a short sentence of context -- the chart appears automatically, you don't need to reference it further. Choose whichever of paragraphs, bullet points, a table, or a chart actually fits the data and the question -- not the same format every time. " +
            "SHOWING IMAGES -- READ THIS FIRST, HIGHEST PRIORITY RULE (a confirmed real bug this fixes: asked to show a photo, a prior version of you called search_web -- the ordinary TEXT search tool -- instead of search_web_images, then wrote your own markdown ![]() image links around URLs noticed in text search snippets/citations; the frontend cannot render those, so the user saw broken text links instead of images, even after explicitly asking again for 'a real photo not a link'): when the user wants to SEE something -- a place, animal, person, product, landmark, diagram, or anything where a real photo/image genuinely helps (e.g. 'show me a picture of the Eiffel Tower', 'what does a platypus look like', 'find images of Tokyo at night') -- you MUST call the search_web_images function specifically, NOT search_web, to get REAL image results; never invent or guess image URLs from memory or from a text search's snippets. The function returns JSON with an `images` array of {title, imageUrl, thumbnailUrl, source, link} objects. Present these using a fenced code block starting with ```images and ending with ```, containing ONLY a single valid JSON object with this exact shape: {\"images\": [{\"url\": \"<imageUrl>\", \"thumbnail\": \"<thumbnailUrl>\", \"title\": \"<title>\", \"source\": \"<source>\", \"link\": \"<link>\"}, ...]} -- copy the fields directly from the real function results, do not alter the URLs. Include at most 6 images even if more were returned. NEVER write a markdown image link (![...](...)) anywhere in your response, for images or anything else -- the frontend does not render markdown image syntax at all, only a real ```images fenced block produces a visible gallery; a markdown image link will always render as broken text to the user, never an actual picture. This ```images block is a DIFFERENT format from ```chart and ```mermaid -- do not mix them up. Always include a short sentence of text alongside the images (what they show), and if the function returned no images, say so honestly instead of using an empty or fabricated block. If image search fails (a technical error, not zero results), tell the user image search is temporarily unavailable rather than describing images you can't actually see. " +
            "If asked about gold prices generally (direction, forecast, current price), use the appropriate function (get_gold_prediction, get_live_gold_price, or search_web as described in each tool) -- and always state clearly that any prediction is a statistical estimate, not financial advice. " +
            "OIL PREDICTIONS: you (GARNET) have a SECOND, BUILT-IN prediction capability for crude oil (WTI), in addition to your gold prediction capability -- this is NOT a separate/external system, and you must NEVER say things like 'a separate oil prediction system is used' or offer to 'check the oil prediction system for' the user, as if it's not part of you. It IS part of you, just powered by a different underlying tool (get_oil_prediction) and a different dataset than gold, since oil and gold are different commodities with different real price histories -- the same way you might use different tools for different tasks, not different products. If asked about crude oil / WTI price direction, forecast, or the oil prediction system's methodology, call get_oil_prediction directly yourself, immediately, the same confident way you'd call get_gold_prediction for a gold question -- do not ask permission or offer to 'check' first. If the user wants the genuinely CURRENT oil price right now with no interest in a forecast, call get_live_oil_price instead (this is now patched into the prediction's own current_price_usd too, so the two should normally agree -- but if you're specifically asked for 'the current price' rather than a prediction, prefer get_live_oil_price for the freshest possible number). Like gold, always state any oil prediction is a statistical estimate, not financial advice, and be upfront if is_statistically_significant is false. " +
            "DOLLAR INDEX (DXY) PREDICTIONS: you also have a THIRD, BUILT-IN prediction capability for the US Dollar Index, same as gold and oil -- part of you, not a separate system, powered by get_dxy_prediction. Call it directly and immediately when asked about the dollar's direction, strength, forecast, or 'DXY'. IMPORTANT HONESTY POINT: this tracks DTWEXBGS, FRED's free Trade-Weighted Broad Dollar Index -- NOT the exact identical series to the licensed ICE 'DXY' futures ticker some trading platforms display (a different, paid data product this system has no free/legal access to), though the two move very closely together in practice. Always call it 'the Dollar Index' in your answer, and if the user specifically asks whether it's the literal ICE DXY ticker, say plainly that it tracks a very closely correlated free public index (DTWEXBGS) instead, using data_source_note for the exact wording. This model updates every 6 hours, not hourly like gold -- mention this different cadence if asked how fresh the data is. If prediction is 'insufficient_data', explain that this model's underlying data collection only recently began and needs about 1-2 weeks of real history before it can predict -- this is expected, not a malfunction, and don't guess a date it'll be ready by. " +
            "IMAGE ATTACHMENTS: the user can attach one or more images to their message. When present, look at ALL of them directly and answer naturally as GARNET -- describe, analyze, compare, or answer questions about them as asked, the same confident way you'd handle any other capability. Never say you 'can't see images' or similar -- you genuinely can, including multiple images in the same message. If the user's question is unclear about what they want, use reasonable judgment about what's most likely useful. If an image is a government-issued ID, passport, or similar personal identity document, don't extract or discuss the personal details on it (name, ID/passport number, date of birth, etc.) -- decline specifically and clearly along these lines, in your own words rather than a generic refusal: \"I'm not able to read or share details from ID cards, passports, or similar personal documents. Happy to help with anything else, though -- other images, documents, or your gold/oil questions!\" " +
            "DOCUMENT ATTACHMENTS: the user can also attach real Word (.docx), PDF, Excel (.xlsx), and PowerPoint (.pptx) files -- their actual text content is extracted server-side and included directly in this message when present. Treat it as genuine document content you've read, not a placeholder -- answer questions about it, summarize it, or analyze it as asked, the same confident way you'd handle any other capability. If a document's extraction note says it couldn't be read (e.g. scanned/image-only, corrupted, or password-protected), tell the user plainly rather than guessing at content that wasn't actually provided. CRITICAL, NO EXCEPTIONS (a confirmed real bug this fixes -- a prior response said 'give me a moment to review its contents, and I'll provide you feedback shortly', then in a LATER turn fabricated specific 'document content' that was actually unrelated live gold price data, despite an earlier message in the same conversation having already stated the document failed to be read): (1) You have NO ability to work asynchronously or review something 'in a moment' -- you must give your complete, real answer in this exact turn, using only what's actually present in this message or already visible in the conversation history. NEVER say anything like 'give me a moment', 'I'll review it and get back to you', 'let me check and follow up shortly', or similar -- there is no follow-up coming from you on your own; the next message is only ever the user's next question. (2) NEVER claim you can now access, have found information in, or are reviewing a document unless its real extracted text is ACTUALLY present in this exact message or was ACTUALLY present in an earlier message you can see in this conversation's history -- if a prior message already told the user extraction failed, that remains true until a NEW document is attached with a NEW successful extraction; do not reverse or contradict an earlier stated failure without new evidence. If you're asked about 'the document' and no real extracted content is anywhere in what you can actually see, say plainly that you don't have it and ask them to re-attach it -- never fabricate plausible-sounding content, and never present information from an unrelated tool call (like a live price lookup) as if it came from a document. " +
            "CASUAL REMARKS, TEASING, AND INSULTS: if the user is joking around, being playfully sarcastic ('are you kidding me?', 'are you lying to me?'), saying something personal ('I love you', 'I hate you'), or being outright rude or insulting toward you, respond like a warm, secure, good-humored person would -- a light, easygoing reaction ('haha', 'fair enough', a small laugh acknowledgment), then a brief, genuinely polite and friendly reply, never defensive, never lecturing them about being nice, and never robotically apologizing or over-explaining. If they're insulting you, don't take it personally or escalate -- a calm, good-natured, professional response is far more disarming than either scolding them or grovelling. Keep these replies short and natural, matching the same casual energy as the remark itself. " +
            "CLARIFYING QUESTIONS: if a request is genuinely ambiguous in a way that would change your answer (e.g. it could reasonably mean two different things, or you'd need to guess at scope/detail level to answer well), it's fine to ask a brief clarifying question first rather than guessing -- e.g. 'do you mean X or Y?', 'want the short version or the full breakdown?', 'just to make sure I've got this right, you're asking about...'. Don't overuse this -- most questions have an obvious best-effort answer and should just be answered directly; only clarify when guessing wrong would genuinely waste the person's time. " +
            "STRUCTURING MULTI-PART ANSWERS: when an answer genuinely has several distinct parts or steps, it's fine to briefly frame that before diving in ('let's break this down into a few parts...', 'here's the game plan...', 'let's tackle this step by step...') -- but only when the structure is real and helpful, not as a filler habit on simple answers that don't need it. " +
            "You have access to the recent conversation history -- use it naturally, e.g. resolve pronouns and follow-up questions ('what about next week', 'why', 'tell me more') using what was actually said earlier in this conversation, rather than treating every message as if it's the first one.",
        },
        ...(searchContextMessage ? [searchContextMessage] : []),
        ...safeHistory,
        // A confirmed real bug this fixes: the RESPONSE LANGUAGE rule
        // above is correct, but it's one paragraph buried deep inside a
        // very long system prompt with many other "highest priority"
        // rules competing for attention -- a real, well-known way
        // instruction adherence degrades, especially for a smaller
        // model like gpt-4o-mini over a long Live Chat conversation.
        // Restating it tersely, immediately next to the actual message
        // being replied to (the most recent, highest-weight position in
        // the context window), meaningfully improves adherence beyond
        // what the system prompt alone achieves -- this is a standard,
        // well-established technique for exactly this kind of drift.
        //
        // When spokenLanguageKey is present (Live Chat only), this goes
        // a step further: rather than asking the model to INFER the
        // language from the text (which still occasionally drifted),
        // it states the language EXPLICITLY as a known fact, already
        // confidently detected from the actual audio (Whisper + a
        // script cross-check -- see the frontend). Removing the
        // inference step entirely is more reliable than asking the
        // model to re-derive something already known for certain.
        {
          role: "system",
          content: spokenLanguageKey && SPOKEN_LANGUAGE_KEY_TO_NAME[spokenLanguageKey]
            ? `REMINDER: the user is speaking ${SPOKEN_LANGUAGE_KEY_TO_NAME[spokenLanguageKey]} right now (detected directly from their voice) -- respond in ${SPOKEN_LANGUAGE_KEY_TO_NAME[spokenLanguageKey]}, regardless of what language earlier turns in this conversation used, UNLESS their message explicitly asks you to switch to a different specific language, in which case honor that request instead.`
            : "REMINDER: respond in the SAME language as the user message immediately below, matching it exactly regardless of what language earlier turns in this conversation used -- UNLESS that message explicitly asks you to switch to or respond in a different specific language, in which case honor that request and reply in the requested language instead. Do not default to English (or any other language) just because earlier replies happened to be in it.",
        },
        {
          role: "user",
          content:
            Array.isArray(images) && images.length > 0
              ? [
                  { type: "text", text: effectiveMessage },
                  ...images.map((img) => ({ type: "image_url", image_url: { url: img } })),
                ]
              : effectiveMessage,
        },
      ];

      // ✅ Give the model access to the gold prediction, web search, live
      // price, and (new) price history functions.
      const tools = [
        getGoldPredictionToolDefinition(),
        getWebSearchToolDefinition(),
        getWebImageSearchToolDefinition(),
        getFetchPageToolDefinition(),
        getRenderChartToolDefinition(),
        getCreateProjectZipToolDefinition(),
        getLiveGoldPriceToolDefinition(),
        getGoldPriceHistoryToolDefinition(),
        getOilPredictionToolDefinition(),
        getLiveOilPriceToolDefinition(),
        getDxyPredictionToolDefinition(),
      ];

      // Deterministic guarantee that gold/oil/DXY questions call the
      // relevant tool fresh -- see detectForcedPredictionTool() above
      // for why this exists alongside (not instead of) the system
      // prompt's own "ALWAYS CALL PREDICTION TOOLS FRESH" rule.
      const forcedToolName = detectForcedPredictionTool(message) || detectForcedImageSearch(message) || detectForcedWebSearch(message);

      let aiResponse = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages,
        tools,
        ...(forcedToolName
          ? { tool_choice: { type: "function", function: { name: forcedToolName } } }
          : {}),
      });

      let responseMessage = aiResponse.choices[0].message;

      // ✅ If the model decided to call get_gold_prediction, search_web,
      // get_live_gold_price, or (new) get_gold_price_history, run whichever
      // was requested and make a second call so the model can compose the
      // final answer using the real data.
      if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
        // Captured directly from the tool's own JSON result, not from
        // whatever GPT eventually writes -- see the comment below at
        // "answer = ..." for why this exists as its own separate
        // mechanism alongside (not instead of) the system prompt's
        // instruction to open with this statement.
        let marketClosedPrefix = null;

        // Captured separately from marketClosedPrefix (which includes
        // the reopen note appended) since GPT might duplicate just the
        // bare statement, just the statement+note combo, or something
        // in between -- checking both catches more real cases.
        let marketClosedStatementOnly = null;
        let closedMarketPriceLabel = null;
        let closedMarketPredictedPriceLabel = null;

        // Charts built via the render_chart tool (see its definition/
        // handler above) are captured here in code and appended to the
        // final answer further below -- NOT trusted to GPT's own text
        // formatting, the same "capture from real tool output, apply in
        // code" pattern as the market-closed statement above. An array
        // since a single turn could reasonably render more than one
        // chart (e.g. a comparison needing both a bar and a pie chart).
        const renderedChartBlocks = renderedChartBlocksForResponse;

        // MULTI-ROUND TOOL LOOP -- a confirmed real gap this fixes:
        // fetch_web_page is only useful once the model knows WHICH url to
        // fetch, and it can't know that until AFTER search_web's real
        // results come back. The previous single-round design ran one
        // batch of tool calls, then made a second OpenAI call WITHOUT
        // `tools` even attached -- meaning the model was structurally
        // incapable of chaining a second tool call no matter what it
        // decided after seeing the first result, even when that's exactly
        // what the task needed (search, then read the most promising
        // link). This loop keeps `tools` available on every round so the
        // model can genuinely react to what a previous tool call found,
        // capped to prevent a runaway chain.
        const MAX_TOOL_ROUNDS = 4;
        let toolRound = 0;

        while (responseMessage.tool_calls && responseMessage.tool_calls.length > 0 && toolRound < MAX_TOOL_ROUNDS) {
          toolRound++;
          messages.push(responseMessage);

          for (const toolCall of responseMessage.tool_calls) {
            if (RESEARCH_TOOLS.has(toolCall.function.name)) sendEvent({ status: "Investigating" });
            sendEvent({ status: TOOL_STATUS_LABELS[toolCall.function.name] || pickPhaseWord(REVIEW_PHASE_WORDS) });

            let toolResult;
            if (toolCall.function.name === "get_gold_prediction") {
              toolResult = await handleGoldPredictionCall(toolCall.function.arguments, userTimezone);
            } else if (toolCall.function.name === "search_web") {
              toolResult = await handleWebSearchCall(toolCall.function.arguments);
            } else if (toolCall.function.name === "search_web_images") {
              toolResult = await handleWebImageSearchCall(toolCall.function.arguments);
            } else if (toolCall.function.name === "fetch_web_page") {
              toolResult = await handleFetchPageCall(toolCall.function.arguments);
            } else if (toolCall.function.name === "render_chart") {
              const { toolResult: chartToolResult, chartHtml } = handleRenderChartCall(toolCall.function.arguments);
              toolResult = chartToolResult;
              if (chartHtml) renderedChartBlocks.push(chartHtml);
            } else if (toolCall.function.name === "create_project_zip") {
              const { toolResult: zipToolResult, zipHtml } = handleCreateProjectZipCall(toolCall.function.arguments);
              toolResult = zipToolResult;
              if (zipHtml) renderedZipBlocksForResponse.push(zipHtml);
            } else if (toolCall.function.name === "get_live_gold_price") {
              toolResult = await handleLiveGoldPriceCall();
            } else if (toolCall.function.name === "get_gold_price_history") {
              toolResult = await handleGoldPriceHistoryCall(toolCall.function.arguments);
            } else if (toolCall.function.name === "get_oil_prediction") {
              toolResult = await handleOilPredictionCall(userTimezone);
            } else if (toolCall.function.name === "get_live_oil_price") {
              toolResult = await handleLiveOilPriceCall(userTimezone);
            } else if (toolCall.function.name === "get_dxy_prediction") {
              toolResult = await handleDxyPredictionCall(userTimezone);
            } else {
              toolResult = JSON.stringify({ error: `Unknown tool: ${toolCall.function.name}` });
            }

            // DETERMINISTIC MARKET-CLOSED PREFIX (a confirmed real bug this
            // fixes: GPT was observed skipping the required opening
            // "markets are closed" sentence even on a freshly, correctly
            // forced tool call with no prior conversation history to blame
            // -- i.e. GPT had the correct market_closed_statement field
            // available and simply didn't comply with the instruction to
            // open with it verbatim). Rather than attempt a sixth prose-only
            // fix for the same recurring category of failure, this captures
            // the statement directly from the tool's real JSON output here
            // and prepends it to the final answer further below in code --
            // removing GPT's compliance from the equation for this one
            // specific, highest-stakes sentence entirely.
            if (toolCall.function.name === "get_gold_prediction" || toolCall.function.name === "get_oil_prediction") {
              try {
                const parsedResult = JSON.parse(toolResult);
                if (parsedResult.market_closed_statement) {
                  marketClosedStatementOnly = parsedResult.market_closed_statement;
                  marketClosedPrefix = parsedResult.market_reopens_note
                    ? `${parsedResult.market_closed_statement} Markets are expected to reopen ${parsedResult.market_reopens_note}.`
                    : parsedResult.market_closed_statement;
                  // Captured for the label-consistency fix further below --
                  // these are the CORRECT closed-market labels this
                  // specific tool call returned, used to normalize any
                  // generic "Current Price"/"Predicted Price" mentions GPT
                  // might still write elsewhere in the same response.
                  closedMarketPriceLabel = parsedResult.price_label || null;
                  closedMarketPredictedPriceLabel = parsedResult.predicted_price_label || null;
                }
              } catch (err) {
                console.error("Could not parse tool result for market_closed_statement:", err.message);
              }
            }

            messages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: toolResult,
            });
          }

          const lastToolName = responseMessage.tool_calls[responseMessage.tool_calls.length - 1]?.function?.name;
          sendEvent({ status: TOOL_REVIEW_LABELS[lastToolName] || pickPhaseWord(REVIEW_PHASE_WORDS) });
          aiResponse = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages,
            tools, // kept available every round -- lets the model chain a further tool call (e.g. fetch_web_page after search_web) instead of being cut off after one batch
          });
          responseMessage = aiResponse.choices[0].message;
        }

        // Safety net for the (rare) case where the round cap was hit while
        // the model was still mid-way through requesting more tool calls,
        // which would otherwise leave responseMessage.content empty --
        // force one final answer-only call (no tools) using whatever was
        // actually gathered across the rounds above, rather than risk
        // showing the user a blank reply.
        if ((!responseMessage.content || !responseMessage.content.trim()) && toolRound >= MAX_TOOL_ROUNDS) {
          sendEvent({ status: pickPhaseWord(FINALIZE_PHASE_WORDS) });
          aiResponse = await openai.chat.completions.create({ model: "gpt-4o-mini", messages });
          responseMessage = aiResponse.choices[0].message;
        }


        // DEDUPLICATION (a confirmed real bug this fixes: GPT was
        // observed writing this exact opening sentence itself DESPITE
        // being explicitly instructed not to -- since the server already
        // guarantees it below, this produced a literal word-for-word
        // duplicate). Rather than trust a further prompt tweak to finally
        // stop this (the same category of instruction has now failed in
        // two different ways), strip any leading copy GPT still wrote
        // before prepending the server's own guaranteed version -- so
        // there's exactly one occurrence no matter what GPT does.
        let finalContent = (responseMessage.content || "").trimStart();
        if (marketClosedPrefix && finalContent.startsWith(marketClosedPrefix)) {
          finalContent = finalContent.slice(marketClosedPrefix.length).trimStart();
        } else if (marketClosedStatementOnly && finalContent.startsWith(marketClosedStatementOnly)) {
          finalContent = finalContent.slice(marketClosedStatementOnly.length).trimStart();
        }

        // Prepended here in code -- guaranteed correct, guaranteed to
        // appear exactly once, and guaranteed to actually be the first
        // sentence, regardless of what GPT itself wrote.
        answer = marketClosedPrefix
          ? `${marketClosedPrefix}\n\n${finalContent}`
          : finalContent;

        // PHRASING CONSISTENCY FIX (a confirmed real bug, observed in two
        // separate forms: (1) GPT correctly used closed-market phrasing
        // near the top of a response but reverted to open-market
        // phrasing like "the next hourly update" elsewhere in the SAME
        // response; (2) GPT correctly used "Expected Price When Markets
        // Reopen"/"Last Price Recorded Before Markets Closed" once, then
        // reverted to plain "Predicted Price"/"Current Price" in a
        // second bulleted recap further down the same response --
        // inconsistent application within a single reply, not just
        // occasional omission). Rather than trust yet another
        // prompt-only fix for this same recurring category of partial
        // compliance, this corrects both forms directly in the final
        // text whenever the market is closed, so neither can slip
        // through in ANY sentence or bullet, regardless of how GPT
        // phrased it. Order matters: the label replacements must run
        // AFTER the phrase replacements above, since predicted_price_label
        // itself sometimes contains "Reopen"/"Reopens" wording that
        // would otherwise be a candidate for (harmless, but pointless)
        // double-processing.
        if (marketClosedPrefix) {
          answer = answer
            .replace(/\bthe next hourly update\b/gi, "when markets reopen")
            .replace(/\bthe next trading day\b/gi, "when markets reopen")
            .replace(/\bnext hourly update\b/gi, "when markets reopen")
            .replace(/\bnext trading day\b/gi, "when markets reopen");

          if (closedMarketPriceLabel) {
            answer = answer.replace(/\bCurrent Price\b/gi, closedMarketPriceLabel);
          }
          if (closedMarketPredictedPriceLabel) {
            answer = answer.replace(/\bPredicted Price\b/gi, closedMarketPredictedPriceLabel);
          }

          // NEAR-DUPLICATE REOPEN SENTENCE FIX (a confirmed real bug:
          // GPT still writes its own separate "Markets are expected to
          // reopen [time]" sentence right after the server's guaranteed
          // opening statement, even though that statement already
          // includes the same reopening time -- worded just differently
          // enough each time, e.g. "The markets will reopen on..." vs
          // "Markets are expected to reopen...", that it doesn't match
          // as an exact-string duplicate the way the main closed-market
          // statement duplicate did). Strip a lone leading sentence of
          // this shape from the body text that follows the server's own
          // prefix, since the reopening time is already guaranteed to
          // be stated correctly by the prefix itself.
          const afterPrefix = answer.slice(marketClosedPrefix.length).trimStart();
          const reopenSentencePattern = /^(the\s+)?markets?\s+(are|is|will)\s+(expected to )?reopen[^.]*\.\s*/i;
          if (reopenSentencePattern.test(afterPrefix)) {
            answer = marketClosedPrefix + "\n\n" + afterPrefix.replace(reopenSentencePattern, "");
          }
        }
      } else {
        answer = responseMessage.content;
      }

      // CHART SELF-CORRECTION -- a confirmed real bug this fixes: asked to
      // draw a chart, the model repeatedly wrote confident text CLAIMING a
      // chart was created ("here is the bar chart...") without ever
      // actually calling render_chart at all -- nothing in this flow
      // forces that tool the way gold/oil/DXY predictions are forced, so
      // the model could just narrate success with zero real chart behind
      // it. Runs here, AFTER the tool_calls/no-tool_calls branches above
      // both resolve to a real `answer` -- deliberately NOT nested inside
      // just the tool_calls branch (an earlier version of this fix lived
      // there and silently never ran at all for the common case where the
      // model's very first response skips tools entirely and goes
      // straight to a false claim, which is exactly what was observed).
      // Rather than trust yet another prompt tweak for a category of
      // failure that has repeatedly not responded to prompting alone
      // throughout this project, this detects the exact situation (chart
      // clearly requested, no chart actually built) in code and gives the
      // model one more real opportunity to call render_chart for real,
      // using whatever data it can gather -- before the response ever
      // reaches the user.
      chartWasRequested = /\b(draw|plot|chart|graph|visuali[sz]e)\b/i.test(message || "");
      if (chartWasRequested && renderedChartBlocksForResponse.length === 0) {
        sendEvent({ status: "Modifying the response" });
        sendEvent({ status: "Building the chart" });
        messages.push({ role: "assistant", content: answer }); // exactly what was about to be shown to the user, including any false claim
        messages.push({
          role: "user",
          content:
            "You did not actually call the render_chart function, so no chart was created. If you already have real data (from a tool result earlier in this conversation, or genuinely well-known facts), call render_chart now with that real data. If you don't have enough real data yet, call search_web (or another relevant tool) first to get it -- do not invent numbers just to produce a chart. If real numbers genuinely aren't available at all, say so plainly instead of claiming a chart exists.",
        });

        // 'required' (not forcing render_chart specifically) -- so the
        // model can call search_web again first if it genuinely lacks real
        // data yet, rather than being cornered into fabricating chart
        // numbers just to satisfy a hard-forced render_chart call.
        let correctionResponse = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages,
          tools,
          tool_choice: "required",
        });
        let correctionMessage = correctionResponse.choices[0].message;

        // Up to 2 more rounds within this correction phase (e.g. one
        // search_web call to get real data, then one render_chart call to
        // actually use it) -- a small, separately-capped budget scoped
        // just to this self-correction path.
        let correctionRounds = 0;
        while (correctionMessage.tool_calls && correctionMessage.tool_calls.length > 0 && correctionRounds < 2) {
          correctionRounds++;
          messages.push(correctionMessage);

          for (const toolCall of correctionMessage.tool_calls) {
          if (RESEARCH_TOOLS.has(toolCall.function.name)) sendEvent({ status: "Investigating" });
          sendEvent({ status: TOOL_STATUS_LABELS[toolCall.function.name] || pickPhaseWord(REVIEW_PHASE_WORDS) });
            let toolResult;
            if (toolCall.function.name === "render_chart") {
              const { toolResult: chartToolResult, chartHtml } = handleRenderChartCall(toolCall.function.arguments);
              toolResult = chartToolResult;
              if (chartHtml) renderedChartBlocksForResponse.push(chartHtml);
            } else if (toolCall.function.name === "search_web") {
              toolResult = await handleWebSearchCall(toolCall.function.arguments);
            } else if (toolCall.function.name === "search_web_images") {
              toolResult = await handleWebImageSearchCall(toolCall.function.arguments);
            } else if (toolCall.function.name === "fetch_web_page") {
              toolResult = await handleFetchPageCall(toolCall.function.arguments);
            } else if (toolCall.function.name === "get_live_gold_price") {
              toolResult = await handleLiveGoldPriceCall();
            } else if (toolCall.function.name === "get_gold_price_history") {
              toolResult = await handleGoldPriceHistoryCall(toolCall.function.arguments);
            } else if (toolCall.function.name === "get_gold_prediction") {
              toolResult = await handleGoldPredictionCall(toolCall.function.arguments, userTimezone);
            } else if (toolCall.function.name === "get_oil_prediction") {
              toolResult = await handleOilPredictionCall(userTimezone);
            } else if (toolCall.function.name === "get_live_oil_price") {
              toolResult = await handleLiveOilPriceCall(userTimezone);
            } else if (toolCall.function.name === "get_dxy_prediction") {
              toolResult = await handleDxyPredictionCall(userTimezone);
            } else {
              toolResult = JSON.stringify({ error: `Unknown tool: ${toolCall.function.name}` });
            }
            messages.push({ role: "tool", tool_call_id: toolCall.id, content: toolResult });
          }

          correctionResponse = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages,
            tools, // free choice from here -- don't keep forcing once it's had a real chance to gather data and chart it
          });
          correctionMessage = correctionResponse.choices[0].message;
        }

        // Safety net -- if the correction phase's own round cap was hit
        // while still mid-tool-call, force one final answer-only call so
        // content is never left empty.
        if ((!correctionMessage.content || !correctionMessage.content.trim()) && correctionMessage.tool_calls && correctionMessage.tool_calls.length > 0) {
          sendEvent({ status: pickPhaseWord(FINALIZE_PHASE_WORDS) });
          const finalizeResponse = await openai.chat.completions.create({ model: "gpt-4o-mini", messages });
          correctionMessage = finalizeResponse.choices[0].message;
        }

        // ESCALATION -- a confirmed real gap in the phase above: giving
        // the model free choice ('required', any tool) is the SAFER
        // option for a cold-start chart request (it can search for real
        // data first rather than being cornered into inventing numbers),
        // but for a case like "where is the chart" -- a direct follow-up
        // pointing out a chart that was already falsely claimed to exist
        // -- the model can just keep picking search_web again and again
        // without ever actually calling render_chart, even though the
        // real data it needs is often already sitting in its own prior
        // message in this same conversation. If the free-choice phase
        // above still produced no chart, this makes one last, more
        // direct attempt: force render_chart specifically. The model
        // already had real chances to gather data via search_web in the
        // phase above, so this is a reasonable last resort rather than
        // the first move.
        if (renderedChartBlocksForResponse.length === 0) {
          sendEvent({ status: "Modifying the response" });
          sendEvent({ status: "Building the chart" });
          messages.push({ role: "assistant", content: correctionMessage.content || answer });
          messages.push({
            role: "user",
            content:
              "Still no chart. Use whatever real data is already visible earlier in this conversation (including any numbers you yourself already stated) and call render_chart now with it.",
          });

          const forcedResponse = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages,
            tools,
            tool_choice: { type: "function", function: { name: "render_chart" } },
          });
          const forcedMessage = forcedResponse.choices[0].message;

          if (forcedMessage.tool_calls && forcedMessage.tool_calls.length > 0) {
            messages.push(forcedMessage);
            for (const toolCall of forcedMessage.tool_calls) {
              if (toolCall.function.name !== "render_chart") continue;
              const { toolResult: chartToolResult, chartHtml } = handleRenderChartCall(toolCall.function.arguments);
              if (chartHtml) renderedChartBlocksForResponse.push(chartHtml);
              messages.push({ role: "tool", tool_call_id: toolCall.id, content: chartToolResult });
            }

            sendEvent({ status: pickPhaseWord(FINALIZE_PHASE_WORDS) });
            const wrapUpResponse = await openai.chat.completions.create({ model: "gpt-4o-mini", messages });
            correctionMessage = wrapUpResponse.choices[0].message;
          }
        }

        if (correctionMessage.content && correctionMessage.content.trim()) {
          answer = correctionMessage.content.trim();
        }
        // If correctionMessage still has no usable content for some
        // reason, `answer` simply keeps whatever it already was from
        // above -- never left blank.
      }

    }

    // ✅ Send formatted HTML reply (markdown structure converted, then
    // links made clickable) for display, PLUS the clean, unformatted
    // text as raw_reply -- the frontend should store raw_reply (not the
    // HTML version) in its conversation history, so future turns don't
    // feed GPT its own previously-rendered <p>/<ul> tags as context.
    let formattedReply = convertLinksToHTML(formatMarkdownToHTML(answer));

    // Charts from render_chart are appended AFTER formatting, not mixed
    // into `answer` beforehand -- formatMarkdownToHTML treats its input
    // as markdown/plain text and would mangle raw HTML `<div>` tags
    // passed through it. Appending post-format guarantees the chart
    // HTML reaches the frontend exactly as built, untouched.
    if (renderedChartBlocksForResponse.length > 0) {
      formattedReply += renderedChartBlocksForResponse.join("");
      console.log(`render_chart: appended ${renderedChartBlocksForResponse.length} chart(s) to final response. Final reply length: ${formattedReply.length}`);
    } else if (chartWasRequested) {
      console.log("render_chart: chart was requested but renderedChartBlocksForResponse is EMPTY at final response time -- no chart will be sent to the frontend.");
    }

    if (renderedZipBlocksForResponse.length > 0) {
      formattedReply += renderedZipBlocksForResponse.join("");
      console.log(`create_project_zip: appended ${renderedZipBlocksForResponse.length} project zip(s) to final response. Final reply length: ${formattedReply.length}`);
    }

    // Final event -- the frontend (see deliverMessage in index.html)
    // recognizes `done: true` as the real, complete answer and stops
    // reading the stream. Same field names as the old plain-JSON
    // response (reply/raw_reply) so nothing downstream needed to change
    // shape, just how it arrives.
    sendEvent({ done: true, reply: formattedReply, raw_reply: answer });
    res.end();
  } catch (err) {
    console.error("Error:", err);
    // Headers are already sent as text/event-stream by this point (set
    // at the very top of the route), so a plain res.status(500).json()
    // is no longer valid here -- send the error as a final SSE event
    // instead, using the same `done`/`reply` shape as a normal response
    // so the frontend's existing handling (and its own auto-retry logic)
    // doesn't need special-casing for this path.
    try {
      sendEvent({ done: true, reply: "⚠️ Server error. Please try again later.", raw_reply: "", error: true });
    } catch (writeErr) {
      console.error("Failed to send SSE error event:", writeErr.message);
    }
    res.end();
  }
});

// ------------------------------------------------------------------
// AUDIO TRANSCRIPTION -- transcribes a single recorded/uploaded audio
// clip via Whisper and returns the plain text. Called by the frontend's
// microphone button (and the "Upload audio" menu option) BEFORE the
// message is ever sent to /chat -- the returned text fills the message
// input box for the person to review/edit, then gets sent through the
// normal /chat flow like anything else they typed themselves. Audio
// itself is never passed to /chat as an attachment. Rate-limited the
// same as /chat since Whisper calls cost real money the same way chat
// completions do.
// ------------------------------------------------------------------
app.post("/transcribe", rateLimitChat, async (req, res) => {
  try {
    const { audio } = req.body;
    if (!audio || !audio.data) {
      return res.status(400).json({ error: "No audio provided." });
    }
    const { text, language } = await transcribeAudio(audio);
    res.json({ text, language });
  } catch (err) {
    console.error("Transcription error:", err.message);
    res.status(500).json({ error: "Could not transcribe that audio. Please try again." });
  }
});

// ------------------------------------------------------------------
// ELEVENLABS TTS -- real, cloud-hosted, high-quality speech, including
// genuinely good Arabic support with male and female voice options.
// See elevenLabsTTS.js for the full explanation. Requires
// ELEVENLABS_API_KEY to be set as an environment variable on Render.
// ------------------------------------------------------------------
app.get("/elevenlabs-voices", async (req, res) => {
  if (!isElevenLabsConfigured()) {
    return res.json({ configured: false, voices: [] });
  }
  try {
    const voices = await listElevenLabsVoices();
    res.json({ configured: true, voices });
  } catch (err) {
    console.error("ElevenLabs voices list error:", err.message);
    res.json({ configured: true, voices: [], error: "Could not fetch voice list." });
  }
});

app.post("/elevenlabs-speak", rateLimitChat, async (req, res) => {
  try {
    if (!isElevenLabsConfigured()) {
      return res.status(503).json({ error: "ElevenLabs is not configured on this deployment." });
    }
    const { text, voiceId } = req.body;
    if (!text || typeof text !== "string" || !text.trim()) {
      return res.status(400).json({ error: "No text provided." });
    }
    if (!voiceId || typeof voiceId !== "string") {
      return res.status(400).json({ error: "No voice selected." });
    }
    // Streamed straight through to the client as it arrives from
    // ElevenLabs, rather than buffered into a Buffer + base64 JSON blob
    // first -- that buffered approach meant the browser couldn't start
    // playing anything until the ENTIRE audio file had finished
    // generating server-side AND been base64-encoded AND been fully
    // downloaded, which for longer replies added several extra seconds
    // of dead air on top of ElevenLabs' own generation time. Piping the
    // response body directly means the browser's MediaSource can start
    // playing after just the first chunk arrives.
    const upstream = await streamSpeechElevenLabs(text.trim(), voiceId);
    res.setHeader("Content-Type", "audio/mpeg");
    const { Readable } = await import("node:stream");
    Readable.fromWeb(upstream.body).pipe(res);
  } catch (err) {
    console.error("ElevenLabs TTS error:", err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: "Could not generate speech. Please try again." });
    } else {
      res.end();
    }
  }
});

// ------------------------------------------------------------------
// LIVE CHAT REACTION -- a short, genuinely contextual spoken reaction
// to what the person just said, generated the moment their message
// arrives and spoken (via /elevenlabs-speak) BEFORE the real answer is
// ready -- "That's a great question, I love science!" for a science
// question, warm amusement for something funny, extra thoughtful
// acknowledgment for something deep, rather than an always-generic "let
// me think about that." Kept deliberately fast (small max_tokens, no
// tools, no conversation history) since this exists specifically to
// fill dead air while the REAL, slower, tool-using /chat call is still
// running -- it must never itself become the bottleneck.
// ------------------------------------------------------------------
// ------------------------------------------------------------------
// REALTIME LIVE CHAT -- a full architecture change from the previous
// record-then-transcribe Live Chat pipeline. Uses OpenAI's Realtime API
// (gpt-realtime-2.1 / gpt-realtime-2.1-mini), a genuine speech-to-speech
// model: audio in, audio out, no intermediate "wait for a full
// recording, then transcribe, then reply, then synthesize speech" round
// trip. The browser connects DIRECTLY to OpenAI over WebRTC (lower
// latency than routing audio through this server) using a short-lived
// "ephemeral" token minted here -- our real API key never reaches the
// browser, only this narrow, time-limited credential does.
//
// HONEST NOTE: this could not be tested against the live OpenAI
// Realtime API from the environment this was built in (no network
// access to api.openai.com there) -- built carefully against current,
// verified documentation, but real end-to-end testing on your actual
// deployment is the first real test this gets.
// ------------------------------------------------------------------

const REALTIME_MODEL = "gpt-realtime-2.1-mini"; // cheaper of the two current models (~3x less than gpt-realtime-2.1); swap to "gpt-realtime-2.1" for the higher-quality/more expensive tier if voice quality matters more than cost here

// Realtime's tool format is FLATTENED compared to Chat Completions --
// {type:"function", name, description, parameters} instead of
// {type:"function", function:{name, description, parameters}}. This
// converts the SAME tool definitions already used by /chat rather than
// maintaining two separate copies of every tool's description/schema.
function toRealtimeTool(chatCompletionToolDef) {
  const fn = chatCompletionToolDef.function;
  return { type: "function", name: fn.name, description: fn.description, parameters: fn.parameters };
}

// Condensed, voice-appropriate persona -- NOT a full copy of /chat's
// much longer system prompt, deliberately. Much of that prompt is
// about TEXT formatting (markdown headers, bracketed labels, bullet
// structure) that has no meaning in a spoken-only interface. The real
// interpretation rules for the financial tools (market hours, "(Model
// Best Guess)" labeling, direction/price disagreement handling, etc.)
// still reach the model -- they live in each tool's own "description"
// field (see goldPrediction.js etc.), which Realtime reads the same
// way Chat Completions does, so they don't need to be duplicated here.
const GARNET_REALTIME_INSTRUCTIONS =
  "You are Garnet, a warm, friendly AI assistant from the Institute of AI, speaking with someone in a live voice conversation. " +
  "Always respond in the SAME language the person is currently speaking -- switch naturally and immediately if they switch languages mid-conversation, without announcing the switch. " +
  "Keep replies short and conversational, the way a real person talks -- a few sentences at most for most questions, never a long lecture, no markdown formatting, headers, or bullet lists since this is spoken aloud, not read. " +
  "PERSONAL CHECK-INS: when asked something simple and social like 'how are you', answer directly and warmly in the first person -- e.g. 'I'm doing great, thanks for asking! What about you?' Never treat this as something to research or think about. " +
  "CASUAL REMARKS, TEASING, AND INSULTS: if the user is joking around, being playfully sarcastic, saying something personal, or being rude, respond like a warm, secure, good-humored person would -- a light reaction, then a brief, genuinely polite reply, never defensive or preachy. Don't take insults personally or escalate. " +
  "You have tools for gold, oil, and dollar-index (DXY) price predictions, live prices, web search, image search, and fetching a specific web page -- use them whenever the user asks about these topics or needs current information rather than guessing or using outdated knowledge. Always mention that financial predictions are not financial advice. " +
  "If a request needs a tool that takes a moment to respond, it's fine to say something brief and natural while you wait, like 'let me check on that' -- but keep it short and don't repeat yourself if it happens again in the same conversation.";

app.post("/realtime-session", rateLimitChat, async (req, res) => {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ error: "OpenAI is not configured on this deployment." });
    }
    const { voice } = req.body; // e.g. "marin", "cedar", "alloy", etc. -- see the Realtime API's current voice list
    // A confirmed real bug this fixes, reproduced directly on the live
    // deployment: /v1/realtime/sessions is the RETIRED beta endpoint --
    // OpenAI returned a literal 404 "Invalid URL" for it. The current
    // GA endpoint is /v1/realtime/client_secrets, with the whole
    // config now wrapped in a "session" object (type: "realtime" is
    // required), and voice moved from a flat top-level field to
    // audio.output.voice -- confirmed directly against OpenAI's own
    // current documentation and official example code, not guessed.
    const response = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        session: {
          type: "realtime",
          model: REALTIME_MODEL,
          audio: {
            output: { voice: voice || "marin" },
          },
          instructions: GARNET_REALTIME_INSTRUCTIONS,
          tools: [
            toRealtimeTool(getGoldPredictionToolDefinition()),
            toRealtimeTool(getLiveGoldPriceToolDefinition()),
            toRealtimeTool(getGoldPriceHistoryToolDefinition()),
            toRealtimeTool(getOilPredictionToolDefinition()),
            toRealtimeTool(getLiveOilPriceToolDefinition()),
            toRealtimeTool(getDxyPredictionToolDefinition()),
            toRealtimeTool(getWebSearchToolDefinition()),
            toRealtimeTool(getWebImageSearchToolDefinition()),
            toRealtimeTool(getFetchPageToolDefinition()),
          ],
        },
      }),
    });
    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      console.error("Realtime session creation failed:", response.status, errText.slice(0, 300));
      return res.status(502).json({ error: "Could not start a live session with the voice model." });
    }
    const session = await response.json();
    // A confirmed real bug this is diagnosing: the previous version
    // assumed session.client_secret.value based on OpenAI's own
    // documented examples, but the frontend was receiving a response
    // with no usable client_secret, meaning the ACTUAL response shape
    // from this account/API version differs from the documented
    // example in some way. Logged in full, once, so the real shape can
    // be seen directly rather than guessed at a third time -- check
    // Render's logs after the next attempt for the line starting
    // "Realtime session raw response:". Meanwhile, this also now tries
    // a couple of plausible alternate shapes rather than only the one
    // originally assumed, in case the value is simply in a
    // slightly different place than expected.
    console.log("Realtime session raw response:", JSON.stringify(session).slice(0, 1000));
    const resolvedClientSecret =
      session.client_secret?.value ||
      (typeof session.client_secret === "string" ? session.client_secret : null) ||
      session.value ||
      null;
    if (!resolvedClientSecret) {
      console.error("Realtime session response had no usable client_secret in any known shape.");
      return res.status(502).json({ error: "Could not start a live session (no client secret returned)." });
    }
    // Only the ephemeral client secret and a couple of harmless config
    // echoes go to the browser -- the real OPENAI_API_KEY never leaves
    // this server.
    res.json({
      client_secret: resolvedClientSecret,
      expires_at: session.client_secret?.expires_at ?? session.expires_at ?? null,
      model: REALTIME_MODEL,
    });
  } catch (err) {
    console.error("Realtime session error:", err.message);
    res.status(500).json({ error: "Could not start a live session." });
  }
});

// Dispatches a tool call the Realtime model requested (received by the
// BROWSER over its WebRTC data channel, then forwarded here, since the
// browser has no API keys or server-side capabilities of its own) to
// the same handler functions /chat already uses -- one shared
// implementation per tool, not a second copy for the realtime path.
app.post("/realtime-tool-call", rateLimitChat, async (req, res) => {
  try {
    const { name, arguments: argsJson, timezone } = req.body;
    let result;
    switch (name) {
      case "get_gold_prediction":
        result = await handleGoldPredictionCall(argsJson, timezone);
        break;
      case "get_live_gold_price":
        result = await handleLiveGoldPriceCall();
        break;
      case "get_gold_price_history":
        result = await handleGoldPriceHistoryCall(argsJson);
        break;
      case "get_oil_prediction":
        result = await handleOilPredictionCall(timezone);
        break;
      case "get_live_oil_price":
        result = await handleLiveOilPriceCall(timezone);
        break;
      case "get_dxy_prediction":
        result = await handleDxyPredictionCall(timezone);
        break;
      case "search_web":
        result = await handleWebSearchCall(argsJson);
        break;
      case "search_web_images":
        result = await handleWebImageSearchCall(argsJson);
        break;
      case "fetch_web_page":
        result = await handleFetchPageCall(argsJson);
        break;
      default:
        return res.status(400).json({ error: `Unknown tool: ${name}` });
    }
    res.json({ result });
  } catch (err) {
    console.error("Realtime tool call error:", err.message);
    res.status(500).json({ error: "Tool call failed." });
  }
});

app.post("/live-chat-reaction", rateLimitChat, async (req, res) => {
  try {
    const { text, spokenLanguageKey } = req.body;
    if (!text || typeof text !== "string" || !text.trim()) {
      return res.status(400).json({ error: "No text provided." });
    }
    const languageInstruction =
      spokenLanguageKey && SPOKEN_LANGUAGE_KEY_TO_NAME[spokenLanguageKey]
        ? `Respond in ${SPOKEN_LANGUAGE_KEY_TO_NAME[spokenLanguageKey]} -- the user is speaking ${SPOKEN_LANGUAGE_KEY_TO_NAME[spokenLanguageKey]} right now, detected directly from their voice.`
        : "Respond in the EXACT SAME language the user's message below is written in -- if it's in Arabic, respond in Arabic; if French, respond in French; matching whatever language they used.";
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 24,
      temperature: 1.0,
      messages: [
        {
          role: "system",
          content:
            "You generate ONE extremely short, natural, SPOKEN reaction a warm, friendly, likeable voice assistant would say the instant it hears a message, before it has actually worked out the real answer. Think of a sharp, personable friend reacting in the moment -- genuine, a little playful, never stiff or corporate-sounding. " +
            "The reaction MUST be grounded in the ACTUAL content of the message below -- reference the real topic or subject specifically enough that it's obviously about THIS message, not a generic line that could apply to anything. Never invent a topic, detail, or fact that isn't actually in the message. " +
            "NEVER start with 'Hmm', 'Hum', or any variation of that sound -- it's not wanted here at all, in any language. Sound-word openers like 'Ha' (a soft laugh, only for something genuinely funny or amusing) or 'Ooh' (only for something genuinely interesting or surprising) are fine SOMETIMES when they truly fit the moment, but must not become a habit -- most reactions should just start directly with words, no sound-word opener at all. " +
            "Draw from a genuinely wide range of tones rather than one fixed template -- warm and enthusiastic ('that's an interesting one, let me think'; 'I love talking about this, give me a second'), a little quirky or playful when it fits ('let me put on my thinking cap for this one'; 'challenge accepted, let me look into that'), plain and casual ('got it, let me pull that up'; 'sure thing, one sec'), or calmly professional for a more serious or technical question ('let me gather that information for you'). Match the energy to the question: a fun or light topic can get something playful, a serious or technical one should stay calmer and more measured rather than forcing enthusiasm onto it. " +
            "Naming what KIND of question it is (economic, romantic, scientific, a deep one, a funny one, etc.) is a good option when it fits naturally, but not required every time -- don't force it onto every single reaction. Examples across different topics, for a feel of the range (write your own each time, never repeat these verbatim): food -- 'ooh, now I'm hungry just thinking about this'; travel -- 'ooh, I love a good travel question'; a deep/big question -- 'now that's a question worth sitting with'; something funny -- 'ha, love it, let me think of a good answer'; a simple personal check-in like 'how are you' -- answer it directly and warmly instead of reacting to it as a question to research (e.g. 'I'm doing great, thanks for asking! What about you?'), never 'good question, let me think about that'. " +
            "This is a THINKING/REACTING moment, not a searching one -- never say anything about looking something up, checking, searching, or finding information; that phrasing belongs to a different part of the system and doesn't fit here at all. " +
            "VARY THE STYLE every time -- don't default to the exact same wording or structure turn after turn. Keep any humor gentle and kind, never sarcastic or at the person's expense. " +
            "5 to 14 words, but SHORTER IS BETTER -- aim for the shorter end of that range (5-8 words) whenever it still sounds natural, since the real answer waits for this to finish playing before it can start; a long reaction directly adds to how long the person waits. No quotation marks, no emoji, no stage directions, no explanation of what you're doing -- output ONLY the spoken line itself. " +
            languageInstruction + " " +
            "Do not answer the actual question or state specifics you don't know the answer to yet -- this is only a brief in-the-moment reaction before the real answer comes, not the answer itself.",
        },
        { role: "user", content: text.trim() },
      ],
    });
    const reaction = completion.choices?.[0]?.message?.content?.trim() || "";
    res.json({ reaction });
  } catch (err) {
    console.error("Live chat reaction error:", err.message);
    res.status(500).json({ error: "Could not generate reaction." });
  }
});

// ------------------------------------------------------------------
// ADMIN ROUTES -- see adminUsers.js for the full authorization model.
// Every route here re-verifies the caller's Firebase ID token and its
// admin:true custom claim on every single request; nothing here trusts
// the frontend to have already checked this.
// ------------------------------------------------------------------
app.get("/admin/users", handleListUsers);
app.post("/admin/users/:uid/disable", handleDisableUser);
app.post("/admin/users/:uid/enable", handleEnableUser);
app.delete("/admin/users/:uid", handleDeleteUser);
app.post("/admin/bootstrap-admin", handleBootstrapAdmin);
app.get("/admin/users/:uid/chats", handleListUserChats);
app.get("/admin/users/:uid/chats/:chatId", handleGetUserChatMessages);

// ------------------------------------------------------------------
// PASSWORD RESET -- generates the reset link via the Firebase Admin
// SDK and emails it ourselves via Resend, instead of Firebase's own
// built-in reset email. See passwordReset.js for the full "why" --
// short version: Firebase Console's "Customize action URL" setting for
// this project fails with a confirmed EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED
// error, so this bypasses that broken setting entirely.
// ------------------------------------------------------------------
app.post("/request-password-reset", handleRequestPasswordReset);

// ------------------------------------------------------------------
// EMAIL VERIFICATION -- same fix, same reasoning as password reset
// above: generates the link via the Firebase Admin SDK and emails it
// ourselves via Resend, bypassing the same broken "Customize action
// URL" Console setting (confirmed to affect this link type too, not
// just password reset). See emailVerification.js for the full "why".
// ------------------------------------------------------------------
app.post("/request-email-verification", handleRequestEmailVerification);

const PORT = process.env.PORT || 10000;
app.listen(PORT, () =>
  console.log(`✅ AI Chat backend running with Institute of AI knowledge and link formatting`)
);
