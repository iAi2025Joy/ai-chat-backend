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
    "Cite the specific source link(s) you actually used, formatted as a normal URL so it becomes " +
    "clickable. Do not just repeat a snippet verbatim -- summarize in your own words. If the results " +
    "don't actually contain a good answer to the question, say so honestly rather than guessing.";

  return block;
}
