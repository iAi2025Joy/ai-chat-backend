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
    return `No web search results were found for "${query}". Tell the user the search did not return relevant results, rather than guessing an answer from general knowledge.`;
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
    "Cite the specific source link(s) you actually used, formatted as a normal URL so it becomes " +
    "clickable. Do not just repeat a snippet verbatim -- summarize in your own words. If the results " +
    "don't actually contain a good answer to the question, say so honestly rather than guessing.";

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
