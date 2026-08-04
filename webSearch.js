// webSearch.js
// ==============
//
// Real web search for the chat's "Web Search" mode, using Serper.dev
// (a Google Search Results API). Confirmed format against Serper's own
// documentation and multiple independent, consistent developer sources:
//
//   POST https://google.serper.dev/search
//   Header: X-API-KEY: <your key>
//   Body: { "q": "search query", "num": 5 }
//   Response: { organic: [{ title, link, snippet, date, position }, ...],
//               answerBox?: {...}, knowledgeGraph?: {...} }
//
// Free tier: 2,500 queries, no credit card required.

const SERPER_API_KEY = process.env.SERPER_API_KEY || "";

export async function performWebSearch(query, numResults = 5) {
  if (!SERPER_API_KEY) {
    throw new Error("SERPER_API_KEY is not set.");
  }

  const response = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "X-API-KEY": SERPER_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ q: query, num: numResults }),
  });

  if (!response.ok) {
    throw new Error(`Serper API returned ${response.status}`);
  }

  const data = await response.json();

  const results = (data.organic || []).map((item) => ({
    title: item.title || "",
    link: item.link || "",
    snippet: item.snippet || "",
    date: item.date || null,
  }));

  // Serper sometimes includes a direct "answer box" (a short, high-confidence
  // direct answer, similar to Google's own featured snippet) -- surface it
  // separately since it's often the most useful single piece of context.
  const answerBox = data.answerBox
    ? {
        answer: data.answerBox.answer || data.answerBox.snippet || null,
        title: data.answerBox.title || null,
      }
    : null;

  return { results, answerBox };
}

// Formats search results into a compact text block to include as context
// for GPT, along with clear instructions on how to use it (cite sources,
// don't just repeat verbatim, be honest if results don't actually answer
// the question).
export function formatSearchResultsForModel(query, searchData) {
  const { results, answerBox } = searchData;

  if (results.length === 0 && !answerBox) {
    return `No web search results were found for "${query}". Tell the user, using words to this effect: "I have searched the web and could not find information about that specific topic" or "This information does not appear to be publicly available online" -- whichever fits better. Do NOT say "I don't have access to that" or "I currently don't have that info" -- you DID search, this states the real outcome (a search that came back empty) rather than implying you never tried. Do not guess an answer from general knowledge instead.`;
  }

  let block = `Real, current web search results for the query "${query}" (retrieved just now):\n\n`;

  if (answerBox && answerBox.answer) {
    block += `DIRECT ANSWER BOX: ${answerBox.answer}\n\n`;
  }

  results.forEach((r, i) => {
    block += `[${i + 1}] ${r.title}\n${r.snippet}\nSource: ${r.link}${r.date ? ` (${r.date})` : ""}\n\n`;
  });

  block +=
    "Use these real results to answer the user's question factually and current as of today. " +
    "If a DIRECT ANSWER BOX is present above, prefer it as your primary source when it directly answers the question (e.g. a price) -- it tends to be a more consistent, aggregated figure than any single listed site, which can vary more between repeated searches. " +
    "DO NOT respond with just a list of website recommendations for the user to go check themselves (e.g. 'here are some sources you can visit', 'check out X, Y, Z') -- a confirmed real complaint about this exact behavior: asked for specific data, a prior response just listed three websites and their links instead of actually reading the search results and answering. Your job is to READ these results and extract/present the actual information directly -- names, numbers, dates, facts, whatever the question asked for -- citing the specific source(s) you pulled each piece from, not delegating the lookup back to the user. " +
    "Cite the specific source link(s) you actually used, formatted as a normal URL so it becomes " +
    "clickable, placed at the END of your response (e.g. a brief 'Source:' or 'Sources:' line after the actual information) -- never lead with links or use them as a substitute for the answer itself. Do not just repeat a snippet verbatim -- summarize in your own words, in full detail (don't compress a rich result down to one thin sentence). " +
    "If the snippets only PARTIALLY answer the question (e.g. they mention some figures/facts but not a complete set, common for requests spanning a very long time range or many data points), present whatever real, specific information the snippets actually contain, clearly note which part you found versus which part you could not find in these results, and only then -- as a supplement, never a replacement for the info you did find -- mention a source where more complete detail may be available. If the results genuinely don't contain anything usable at all, say so honestly rather than guessing or fabricating.";

  return block;
}

// ------------------------------------------------------------------
// NEW: real tool definition + handler, so GPT can invoke search on its
// own judgment based on the question's content -- e.g. "what's the
// current gold price" should trigger this automatically, without the
// user needing to manually switch to Web Search mode. This is separate
// from (and in addition to) the existing mode==="web" deterministic
// search-first behavior in server.js, which still works exactly as
// before for anyone who does use that toggle.
// ------------------------------------------------------------------

export function getWebSearchToolDefinition() {
  return {
    type: "function",
    function: {
      name: "search_web",
      description:
        "Search the web for real, current information. Use this for current events, recent news, or anything time-sensitive you would not reliably know. For the CURRENT or LIVE price of gold specifically, use get_live_gold_price instead -- it calls a dedicated real-time financial data API directly, which is more reliable than search results for a live numeric price (search reflects a search engine's cached index of a page, which can lag behind the true live value). For a gold PREDICTION/forecast, use get_gold_prediction instead.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query to look up. Be specific (e.g. 'current gold price per ounce today', not just 'gold').",
          },
        },
        required: ["query"],
      },
    },
  };
}

export async function handleWebSearchCall(argsJson) {
  let args = {};
  try {
    args = argsJson ? JSON.parse(argsJson) : {};
  } catch {
    args = {};
  }
  const query = args.query || "";
  if (!query) {
    return "Error: no search query was provided.";
  }

  try {
    const searchData = await performWebSearch(query);
    return formatSearchResultsForModel(query, searchData);
  } catch (err) {
    return `Web search failed (technical error: ${err.message}). Tell the user real-time search is temporarily unavailable, and offer to answer from general knowledge instead, being clear it may not be fully current.`;
  }
}

// ------------------------------------------------------------------
// IMAGE SEARCH -- real image results via Serper's Images endpoint
// (same API key as the regular web search above, same provider, just a
// different endpoint):
//
//   POST https://google.serper.dev/images
//   Header: X-API-KEY: <your key>
//   Body: { "q": "search query", "num": 8 }
//   Response: { images: [{ title, imageUrl, imageWidth, imageHeight,
//                           thumbnailUrl, source, domain, link }, ...] }
//
// Used when the user wants to actually SEE something (a place, an
// animal, a product, a person, a diagram) rather than read about it --
// the frontend renders these as a real image gallery, not just links.
// ------------------------------------------------------------------

export async function performImageSearch(query, numResults = 8) {
  if (!SERPER_API_KEY) {
    throw new Error("SERPER_API_KEY is not set.");
  }

  const response = await fetch("https://google.serper.dev/images", {
    method: "POST",
    headers: {
      "X-API-KEY": SERPER_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ q: query, num: numResults }),
  });

  if (!response.ok) {
    throw new Error(`Serper Images API returned ${response.status}`);
  }

  const data = await response.json();

  return (data.images || [])
    .filter((img) => img.imageUrl && img.thumbnailUrl) // skip any malformed entries missing a real image
    .map((img) => ({
      title: img.title || "",
      imageUrl: img.imageUrl,
      thumbnailUrl: img.thumbnailUrl,
      source: img.domain || img.source || "",
      link: img.link || img.imageUrl,
    }));
}

export function getWebImageSearchToolDefinition() {
  return {
    type: "function",
    function: {
      name: "search_web_images",
      description:
        "Search the web for real images and show them to the user. Use this whenever the user wants to SEE something rather than just read about it -- e.g. 'show me a picture of X', 'what does X look like', 'find images of X', or any request where a visual would genuinely help (a place, animal, person, product, landmark, diagram, etc.). Do not use this for abstract or non-visual questions.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "What to search images for. Be specific and visual (e.g. 'golden retriever puppy', not just 'dog breeds').",
          },
        },
        required: ["query"],
      },
    },
  };
}

export async function handleWebImageSearchCall(argsJson) {
  let args = {};
  try {
    args = argsJson ? JSON.parse(argsJson) : {};
  } catch {
    args = {};
  }
  const query = args.query || "";
  if (!query) {
    return JSON.stringify({ error: "No image search query was provided." });
  }

  try {
    const images = await performImageSearch(query);
    if (images.length === 0) {
      return JSON.stringify({ query, images: [], note: "No images were found for this query." });
    }
    // Returned as real structured data (not prose) -- the system prompt
    // instructs the model to embed this directly into a ```images
    // fenced block so the frontend can render an actual gallery, the
    // same "tool returns real data, model embeds it in a fenced block,
    // frontend renders it" pattern already used for price charts.
    return JSON.stringify({ query, images });
  } catch (err) {
    return JSON.stringify({
      error: `Image search failed (technical error: ${err.message}).`,
      note: "Tell the user image search is temporarily unavailable.",
    });
  }
}

// ------------------------------------------------------------------
// FETCH A REAL PAGE'S CONTENT -- a confirmed real gap this fixes:
// search_web only returns short SNIPPETS of each result (a sentence or
// two Google's index shows), not the full page. For anything a snippet
// alone can't fully answer (e.g. "give me Dr. X's research papers" --
// the snippet mentions the person exists, but a full publications list
// is only on the actual page), the model was defaulting to "here's a
// database you could check" instead of ever actually reading the page.
// This tool does what a human would do next: open one of the real links
// search_web just returned and read what's actually on it.
// ------------------------------------------------------------------

const MAX_FETCHED_PAGE_CHARS = 6000; // keeps token usage reasonable while still giving real substance to work with

// Basic guard against this tool being pointed at internal/private network
// targets -- not full SSRF protection (that would need DNS resolution +
// checking the resolved IP, not just the hostname string, to catch DNS
// rebinding), but blocks the obvious, trivial cases before this server
// makes a real outbound request to whatever URL ends up here.
function isUrlSafeToFetch(urlString) {
  let parsed;
  try {
    parsed = new URL(urlString);
  } catch {
    return false;
  }
  if (!["http:", "https:"].includes(parsed.protocol)) return false;
  const hostname = parsed.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    hostname === "::1" ||
    hostname.startsWith("169.254.") || // link-local, including cloud metadata endpoints
    hostname.startsWith("10.") ||
    hostname.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
  ) {
    return false;
  }
  return true;
}

export async function fetchPageContent(url) {
  if (!isUrlSafeToFetch(url)) {
    throw new Error("This URL cannot be fetched (invalid or points to a restricted network target).");
  }

  const response = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; GARNET-26/1.0)" },
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`Page returned HTTP ${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html") && !contentType.includes("text")) {
    throw new Error(`URL is not a readable web page (content-type: ${contentType})`);
  }

  const html = await response.text();

  // Simple, dependency-free HTML-to-text extraction: strip script/style
  // blocks entirely (their content is never real page text), strip all
  // remaining tags, decode the handful of common HTML entities, and
  // collapse whitespace -- not a full readability parser, but enough to
  // give the model genuine page text to read instead of just a snippet.
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|li|h[1-6]|tr|br)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();

  if (text.length > MAX_FETCHED_PAGE_CHARS) {
    text = text.slice(0, MAX_FETCHED_PAGE_CHARS) + " [...truncated]";
  }

  return text;
}

export function getFetchPageToolDefinition() {
  return {
    type: "function",
    function: {
      name: "fetch_web_page",
      description:
        "Fetch and read the REAL, full text content of a specific web page by URL. Use this AFTER search_web (or search_web_images) has returned real result links, whenever the short snippets alone don't contain enough detail to fully answer the user's question -- e.g. a request for a detailed list (publications, product specs, event schedule, full article content) where the snippet only confirms the topic exists but not the actual detail. Pass a URL that was ACTUALLY returned by a prior search_web/search_web_images call in this same turn -- never a guessed or fabricated URL. After reading the returned page text, extract and present the real information directly to the user -- do NOT just tell the user to visit the link themselves; that defeats the purpose of fetching it.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "The exact URL to fetch, copied from a real search_web or search_web_images result.",
          },
        },
        required: ["url"],
      },
    },
  };
}

export async function handleFetchPageCall(argsJson) {
  let args = {};
  try {
    args = argsJson ? JSON.parse(argsJson) : {};
  } catch {
    args = {};
  }
  const url = args.url || "";
  if (!url) {
    return "Error: no URL was provided.";
  }

  try {
    const text = await fetchPageContent(url);
    if (!text) {
      return `The page at ${url} was fetched but contained no readable text content. Try a different result, or tell the user this specific page didn't have usable content.`;
    }
    return `Real content fetched from ${url}:\n\n${text}\n\n---\nUse this real page content to answer the user's question directly and specifically -- extract and present the actual information, don't just summarize that the page exists. Cite this URL as the source.`;
  } catch (err) {
    return `Could not fetch that page (technical error: ${err.message}). Tell the user this specific source couldn't be read, and either try a different result from the search or answer with whatever the search snippets themselves already contained.`;
  }
}
