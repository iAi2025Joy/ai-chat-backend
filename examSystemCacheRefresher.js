// examSystemCacheRefresher.js
// ====================
//
// The actual refresh logic for GARNET's School and Students exam-
// system cache -- exported so it can be triggered TWO ways:
//
//   1. Manually / locally: `node refreshExamSystemCache.js`
//   2. On a schedule, at no cost: a free GitHub Actions workflow calls
//      the protected POST /admin/refresh-exam-cache endpoint on this
//      same free Render backend once a DAY (see server.js and
//      .github/workflows/monthly-exam-cache-refresh.yml -- filename
//      kept for continuity even though the schedule is now daily).
//
// Refreshes ONE rotation item per day (a single country OR a single
// international system -- see examSystemCacheSeedList.js's
// getTodaysRotationItem, which picks the day's item deterministically
// from the real calendar date) instead of all 28 items in one monthly
// burst. That earlier approach needed ~1,280 real search queries in
// one sitting, which exceeded what a free search-API tier can sustain
// in a single run (a confirmed real failure -- Serper's one-time free
// allowance ran out partway through a run).
//
// USES TAVILY (https://tavily.com), NOT Google Custom Search -- an
// earlier version of this file used Google's API, but Google
// discontinued free "search the entire web" for new Programmable
// Search Engines as of January 20, 2026 (new engines are hard-capped
// at 50 specific domains, useless for this job's need to find results
// from any relevant site). Verified via real, current sources before
// switching -- Tavily offers a genuine, RECURRING 1,000 free API
// credits/month, no credit card required, resetting monthly (unlike
// Google's discontinued option or Brave's similarly-gutted free tier,
// both confirmed removed in early 2026). Needs TAVILY_API_KEY1 set as
// a Render environment variable.
//
// REAL SCOPE ADJUSTMENT to fit the free budget: 3 real searches per
// entry (syllabus, past papers, textbooks) instead of 5 -- 10 entries
// x 3 searches x ~28 days per full rotation cycle = ~840 queries/
// month, comfortably under Tavily's 1,000/month free limit with real
// buffer room. The "model answers" and "study guide" searches from an
// earlier, wider-coverage version were dropped specifically to make
// this budget work.
//
// International systems are part of the SAME daily rotation as the
// Arabic countries (previously separate and monthly).
//
// Still accumulates rather than overwrites (see mergeAndSave below) --
// each day's real findings for that day's item are merged into
// whatever was already cached for it, de-duplicated by URL, so the
// real content genuinely grows across each ~28-day full cycle rather
// than being replaced each time.

import admin from "firebase-admin";
import { getFirebaseAdmin } from "./adminUsers.js";
import {
  getTodaysRotationItem,
  buildSubjectGradeCombos,
  cacheDocId,
  countryCacheDocId,
} from "./examSystemCacheSeedList.js";

function getDb() {
  getFirebaseAdmin(); // ensures admin.initializeApp() has actually run -- throws a clear error if FIREBASE_SERVICE_ACCOUNT_JSON is missing, same as adminUsers.js's own routes do
  return admin.firestore();
}

// Tavily's real Search API -- returns the same {results, answerBox}
// shape the earlier Serper/Google-based versions of this file used,
// so the rest of this file's logic didn't need to change, just the
// actual HTTP call underneath. "basic" search_depth costs 1 credit
// per call (vs. 2 for "advanced") -- used throughout to stay well
// within the free monthly budget. Tavily has no direct equivalent of
// Serper's "answer box" -- answerBox is always null here, callers
// already handle that gracefully by falling back to combined snippets.
//
// A confirmed real bug this fixes: some pages' markdown extraction
// includes embedded base64-encoded images (a page's own logo/icon,
// e.g. "![Scribd](data:image/svg+xml;base64,PD94bWwg...") -- these are
// pure binary noise, not readable text, but can be extremely long
// (often 10,000+ characters for a single embedded SVG), meaning a
// single embedded image could consume the ENTIRE 6,000-character
// content budget on its own, crowding out the actual real, useful
// text that should have been there instead -- exactly what was
// reported as "corrupted" content. Strips any markdown image
// referencing a data: URI (never useful as readable text regardless
// of format) before the length cap is applied.
function stripEmbeddedBase64Images(text) {
  return (text || "").replace(/!\[[^\]]*\]\(data:[^)]+\)/g, "");
}

// Tavily's dedicated Extract API -- a real, separate fallback for
// results where /search's own lightweight raw_content extraction came
// back empty or too short to be genuinely useful (page structure it
// couldn't parse cleanly, JS-rendered content, etc. -- a normal,
// expected failure mode for SOME pages, not every one). Used only as
// a targeted fallback, not for every result, to keep real credit cost
// bounded -- "basic" extract_depth costs 1 credit per URL, the same
// as a basic search.
async function extractPageContent(url) {
  const apiKey = process.env.TAVILY_API_KEY1;
  try {
    const response = await fetch("https://api.tavily.com/extract", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ urls: [url], extract_depth: "basic", format: "markdown" }),
    });
    if (!response.ok) return "";
    const data = await response.json();
    const result = (data.results || [])[0];
    return result ? stripEmbeddedBase64Images(result.raw_content || "") : "";
  } catch (err) {
    return ""; // a failed fallback attempt just means no content for this one result -- never breaks the overall run
  }
}

// PER EXPLICIT REQUEST: stores the REAL material itself, not a
// snippet-plus-link stub -- a single "content" field per item, always
// populated with the best real text actually available (Tavily
// search's own raw_content, or the dedicated Extract API as a
// fallback when that came back too short, or Tavily's own short
// search snippet only as a last resort if both real-content attempts
// genuinely failed). No separate "snippet" field is kept once real
// content exists -- it added no value beyond what's already folded
// into content. url stays, for real citation purposes, not as a
// stand-in for the material itself. Capped at 6,000 characters --
// Firestore's 1 MiB per-document limit makes storing truly unlimited
// full-page text per entry unsafe, but 6,000 characters is
// substantially more real, readable material than a snippet while
// staying comfortably within that limit even with several results per
// entry.
const MIN_USEFUL_CONTENT_LENGTH = 200; // shorter than this suggests extraction genuinely failed, not just a naturally short page

async function performTavilySearch(query, maxResults = 5) {
  const apiKey = process.env.TAVILY_API_KEY1;
  if (!apiKey) {
    throw new Error("TAVILY_API_KEY1 is not set.");
  }
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, search_depth: "basic", max_results: maxResults, include_answer: false, include_raw_content: "markdown" }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Tavily API returned ${response.status}: ${body.slice(0, 200)}`);
  }
  const data = await response.json();
  const results = await Promise.all((data.results || []).map(async (item) => {
    let content = stripEmbeddedBase64Images(item.raw_content || "");
    if (content.trim().length < MIN_USEFUL_CONTENT_LENGTH && item.url) {
      // Search-time extraction came back too short -- a targeted
      // fallback attempt at the real content via Extract, rather than
      // silently settling for a thin snippet.
      const extracted = await extractPageContent(item.url);
      if (extracted.trim().length > content.trim().length) content = extracted;
    }
    if (content.trim().length < MIN_USEFUL_CONTENT_LENGTH) {
      // Both real-content attempts genuinely failed for this one
      // result -- Tavily's own short search snippet as the last
      // resort, so this result isn't dropped entirely, just clearly
      // thinner than the real-content results.
      content = item.content || "";
    }
    return { title: item.title || "", link: item.url || "", content: content.slice(0, 6000) };
  }));
  return { results, answerBox: null };
}

// Merges a newly-found list of {title, url, ...} items into an
// existing one, de-duplicated by url. A confirmed real bug this fixes:
// the previous version only ever ADDED genuinely new urls and left an
// already-existing url's item completely untouched -- meaning if a
// later run's real search returned the same url again (common --
// past-paper/syllabus pages don't disappear month to month), any new,
// richer fields on it (like the real extracted content added in this
// same update) would NEVER actually reach an entry that already had
// that url cached from before, silently keeping it thinner forever.
// Now merges richer fields (any real, non-empty value) into the
// existing item when the same url reappears, instead of just skipping
// it.
function mergeByUrl(existingItems, newItems) {
  const existing = Array.isArray(existingItems) ? existingItems : [];
  const byUrl = new Map(existing.filter((item) => item.url).map((item) => [item.url, item]));
  for (const item of Array.isArray(newItems) ? newItems : []) {
    if (!item.url) continue;
    if (byUrl.has(item.url)) {
      const prior = byUrl.get(item.url);
      const richerFields = Object.fromEntries(Object.entries(item).filter(([, v]) => v !== undefined && v !== null && v !== ""));
      byUrl.set(item.url, { ...prior, ...richerFields });
    } else {
      byUrl.set(item.url, item);
    }
  }
  return Array.from(byUrl.values());
}

// Shared by both entry types -- 3 real, targeted searches (syllabus,
// past papers, textbooks), trimmed from an earlier 5-search version
// specifically to fit Tavily's real 1,000-credit/month free budget
// across a full 28-day rotation cycle (see this file's header comment
// for the exact math). Stores the real material itself (content),
// per explicit request -- no separate snippet field, that's already
// folded into content by performTavilySearch's own real-content-first,
// Extract-fallback, snippet-last-resort logic.
async function gatherRealData(topicQueryPrefix, subject, gradeBand) {
  const [syllabusResult, papersResult, textbookResult] = await Promise.all([
    performTavilySearch(`${topicQueryPrefix} ${subject} syllabus specification ${gradeBand}`, 3),
    performTavilySearch(`${topicQueryPrefix} ${subject} past papers`, 5),
    performTavilySearch(`${topicQueryPrefix} ${subject} recommended textbook`, 3),
  ]);

  const topSyllabusResult = syllabusResult.results[0];
  const syllabusSummary = topSyllabusResult ? topSyllabusResult.content : "";

  const newPastPapers = papersResult.results.slice(0, 4).map((r) => ({
    title: r.title, url: r.link, content: r.content, kind: "past paper",
  }));
  const newTextbookReferences = textbookResult.results.slice(0, 3).map((r) => ({
    title: r.title, url: r.link, content: r.content, kind: "textbook",
  }));
  const newSourceUrls = [...syllabusResult.results, ...papersResult.results, ...textbookResult.results].map((r) => r.link).filter(Boolean);

  return { syllabusSummary, newPastPapers, newTextbookReferences, newSourceUrls };
}

// Reads whatever's already cached (if anything), merges this run's
// newly-found real results into it, and writes the merged data back --
// the actual accumulation behavior, not a fresh overwrite each time.
async function mergeAndSave(db, docId, baseFields, gathered) {
  const docRef = db.collection("examSystemCache").doc(docId);
  const existingSnap = await docRef.get();
  const existing = existingSnap.exists ? existingSnap.data() : {};

  const pastPapers = mergeByUrl(existing.pastPapers, gathered.newPastPapers);
  const textbookReferences = mergeByUrl(existing.textbookReferences, gathered.newTextbookReferences);
  const sourceUrls = Array.from(new Set([...(existing.sourceUrls || []), ...gathered.newSourceUrls]));
  const syllabusSummary = gathered.syllabusSummary && gathered.syllabusSummary.trim()
    ? gathered.syllabusSummary
    : (existing.syllabusSummary || "");

  await docRef.set({
    ...baseFields,
    syllabusSummary,
    pastPapers,
    textbookReferences,
    sourceUrls,
    lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
  });
}

async function refreshCountryToday(country) {
  const db = getDb();
  const combos = buildSubjectGradeCombos();
  let succeeded = 0;
  let skipped = 0;
  const failures = [];
  for (const { subject, gradeBand } of combos) {
    const docId = countryCacheDocId(country, subject, gradeBand);
    try {
      console.log(`Refreshing: ${docId}`);
      const gathered = await gatherRealData(`${country} national curriculum ministry of education`, subject, gradeBand);
      await mergeAndSave(db, docId, { entryType: "country", country, subject, gradeBand }, gathered);
      console.log(`  Saved ${docId}`);
      succeeded++;
    } catch (err) {
      console.error(`  Failed to refresh ${docId}:`, err.message);
      skipped++;
      failures.push({ docId, error: err.message });
    }
    await new Promise((resolve) => setTimeout(resolve, 500)); // a small pause between entries, being a good citizen toward the search API's own rate limits
  }
  return { succeeded, skipped, failures };
}

async function refreshInternationalSystemToday(examSystem) {
  const db = getDb();
  const combos = buildSubjectGradeCombos();
  let succeeded = 0;
  let skipped = 0;
  const failures = [];
  for (const { subject, gradeBand } of combos) {
    const docId = cacheDocId(examSystem, subject, gradeBand);
    try {
      console.log(`Refreshing: ${docId}`);
      const gathered = await gatherRealData(examSystem, subject, gradeBand);
      await mergeAndSave(db, docId, { entryType: "international", examSystem, subject, gradeBand }, gathered);
      console.log(`  Saved ${docId}`);
      succeeded++;
    } catch (err) {
      console.error(`  Failed to refresh ${docId}:`, err.message);
      skipped++;
      failures.push({ docId, error: err.message });
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return { succeeded, skipped, failures };
}

// The single shared entry point both the standalone script and the
// HTTP endpoint call -- refreshes ONLY today's single rotation item
// (see getTodaysRotationItem's own comment on how "today" is picked)
// and returns a real summary for just that item.
export async function runExamSystemCacheRefresh() {
  const todaysItem = getTodaysRotationItem();
  console.log(`Today's rotation item: ${todaysItem.type === "country" ? todaysItem.country : todaysItem.examSystem} (${todaysItem.type})`);

  const result = todaysItem.type === "country"
    ? await refreshCountryToday(todaysItem.country)
    : await refreshInternationalSystemToday(todaysItem.examSystem);

  const summary = {
    rotationItem: todaysItem,
    total: 10,
    succeeded: result.succeeded,
    skipped: result.skipped,
    failures: result.failures,
  };
  console.log(`Done. ${summary.succeeded} refreshed, ${summary.skipped} skipped/failed.`);
  return summary;
}
