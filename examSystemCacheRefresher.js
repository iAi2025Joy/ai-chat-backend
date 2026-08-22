// examSystemCacheRefresher.js
// ====================
//
// The actual refresh logic for GARNET's School and Students exam-
// system cache -- exported so it can be triggered TWO ways, both free:
//
//   1. Manually / locally: `node refreshExamSystemCache.js`
//   2. On a schedule, at no cost: a free GitHub Actions workflow calls
//      the protected POST /admin/refresh-exam-cache endpoint on this
//      same free Render backend once a month (see server.js and
//      .github/workflows/monthly-exam-cache-refresh.yml) -- this
//      avoids Render's own Cron Jobs feature, which requires a paid
//      instance type. Both paths run through this exact same code, so
//      there's no risk of the two ever drifting apart.
//
// For each (exam system, subject, grade band) in
// examSystemCacheSeedList.js, this does a REAL web search to gather a
// current syllabus summary, real past-paper links, and real textbook
// references, then writes the result to Firestore. server.js's /chat
// handler reads this cache (see the SCHOOL AND STUDENTS CACHE LOOKUP
// block) to give faster, richer answers for these common combinations,
// while still doing its own live per-question search for the specific
// question itself.

import OpenAI from "openai";
import admin from "firebase-admin";
import { getFirebaseAdmin } from "./adminUsers.js";
import { handleWebSearchCall } from "./webSearch.js";
import { buildSeedList, cacheDocId } from "./examSystemCacheSeedList.js";

function getOpenAiClient() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function getDb() {
  getFirebaseAdmin(); // ensures admin.initializeApp() has actually run -- throws a clear error if FIREBASE_SERVICE_ACCOUNT_JSON is missing, same as adminUsers.js's own routes do
  return admin.firestore();
}

// A small, focused tool set -- just enough for this job's one purpose
// (find real current info), reusing the same real search provider
// server.js's own search_web tool calls in a normal chat request --
// kept intentionally simpler here since this runs unattended, not as
// part of an interactive chat turn.
const REFRESH_TOOLS = [
  {
    type: "function",
    function: {
      name: "search_web",
      description: "Search the web for real, current results.",
      parameters: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      },
    },
  },
];

async function refreshOneEntry(openai, { examSystem, subject, gradeBand }) {
  const docId = cacheDocId(examSystem, subject, gradeBand);
  console.log(`Refreshing: ${docId}`);

  const messages = [
    {
      role: "system",
      content:
        "You are gathering REAL, current reference information for a school exam-prep cache. " +
        "Use search_web to find the real current syllabus/specification, 2-3 REAL past exam paper " +
        "links (with real years), and 1-2 real, commonly-used textbook titles+authors for the given " +
        "exam system, subject, and grade band. NEVER invent a paper, year, or textbook that wasn't " +
        "actually found via a real search. Respond with ONLY a JSON object, no other text, no markdown " +
        "fences, in exactly this shape: " +
        '{"syllabusSummary": "2-3 sentence real summary of what this grade band\'s syllabus for this ' +
        'subject actually covers", "pastPapers": [{"title": "...", "url": "...", "year": "..."}], ' +
        '"textbookReferences": [{"title": "...", "author": "..."}], "sourceUrls": ["..."]}',
    },
    {
      role: "user",
      content: `Exam system: ${examSystem}. Subject: ${subject}. Grade band: ${gradeBand}.`,
    },
  ];

  let response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages,
    tools: REFRESH_TOOLS,
  });

  // Up to 4 tool-call rounds -- enough for a couple of real searches
  // without risking this unattended job looping indefinitely.
  let rounds = 0;
  while (response.choices[0].message.tool_calls && rounds < 4) {
    rounds++;
    const toolMessage = response.choices[0].message;
    messages.push(toolMessage);
    for (const toolCall of toolMessage.tool_calls) {
      const result = await handleWebSearchCall(toolCall.function.arguments);
      messages.push({ role: "tool", tool_call_id: toolCall.id, content: result });
    }
    response = await openai.chat.completions.create({ model: "gpt-4o", messages, tools: REFRESH_TOOLS });
  }

  const raw = response.choices[0].message.content || "{}";
  let parsed;
  try {
    parsed = JSON.parse(raw.replace(/^```json\s*|\s*```$/g, ""));
  } catch (err) {
    console.error(`  Could not parse result for ${docId} -- skipping this entry, leaving any previous cached version in place. Raw: ${raw.slice(0, 200)}`);
    return { docId, skipped: true };
  }

  const db = getDb();
  await db.collection("examSystemCache").doc(docId).set({
    examSystem,
    subject,
    gradeBand,
    syllabusSummary: parsed.syllabusSummary || "",
    pastPapers: Array.isArray(parsed.pastPapers) ? parsed.pastPapers : [],
    textbookReferences: Array.isArray(parsed.textbookReferences) ? parsed.textbookReferences : [],
    sourceUrls: Array.isArray(parsed.sourceUrls) ? parsed.sourceUrls : [],
    lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
  });
  console.log(`  Saved ${docId}`);
  return { docId, skipped: false };
}

// The single shared entry point both the standalone script and the
// HTTP endpoint call -- runs the whole seed list start to finish and
// returns a real summary (used in the HTTP response, and printed by
// the standalone script).
export async function runExamSystemCacheRefresh() {
  const openai = getOpenAiClient();
  const seedList = buildSeedList();
  console.log(`Starting refresh of ${seedList.length} exam-system cache entries...`);
  let succeeded = 0;
  let skipped = 0;
  const failures = [];
  for (const entry of seedList) {
    try {
      const result = await refreshOneEntry(openai, entry);
      if (result.skipped) skipped++;
      else succeeded++;
    } catch (err) {
      const docId = cacheDocId(entry.examSystem, entry.subject, entry.gradeBand);
      console.error(`  Failed to refresh ${docId}:`, err.message);
      skipped++;
      failures.push({ docId, error: err.message });
    }
    // A small pause between entries -- avoids bursting the OpenAI/
    // search-provider rate limits across 60 back-to-back calls, the
    // same real lesson learned from this session's own TPM 429 issue.
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  const summary = { total: seedList.length, succeeded, skipped, failures };
  console.log(`Done. ${succeeded} refreshed, ${skipped} skipped/failed.`);
  return summary;
}
