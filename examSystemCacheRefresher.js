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
// PER EXPLICIT REQUEST: refreshes ONE rotation item per day (a single
// country OR a single international system -- see
// examSystemCacheSeedList.js's getTodaysRotationItem, which picks the
// day's item deterministically from the real calendar date) instead
// of all 28 items in one monthly burst. That earlier approach needed
// ~1,280 real search queries in one sitting, which exceeded what a
// free search-API tier can sustain in a single run (a confirmed real
// failure -- Serper's one-time free allowance ran out partway through
// a run). One rotation item's 10 entries (5 subjects x 2 grade bands)
// x 5 real searches each = ~50 queries/day, comfortably inside a real,
// RECURRING free daily quota.
//
// PER EXPLICIT REQUEST: uses Google's Custom Search JSON API (100
// free queries/day, resetting daily) instead of Serper -- genuinely
// sustainable at this job's real daily volume, unlike Serper's one-
// time allowance. Needs GOOGLE_CUSTOM_SEARCH_API_KEY and
// GOOGLE_CUSTOM_SEARCH_ENGINE_ID set as Render environment variables.
//
// PER EXPLICIT REQUEST: international systems are now part of the
// SAME daily rotation as the Arabic countries (previously separate,
// monthly, and Serper-based) -- both entry types get the same 5-query
// treatment now that there's comfortable daily quota headroom for it.
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

// Google's Custom Search JSON API -- returns the same {results,
// answerBox} shape performWebSearch (the old Serper-based function)
// did, so the rest of this file's logic didn't need to change, just
// the actual HTTP call underneath. Google's API has no direct
// equivalent of Serper's "answer box" -- answerBox is always null
// here, callers already handle that gracefully by falling back to
// combined snippets.
async function performGoogleSearch(query, numResults = 5) {
  const apiKey = process.env.GOOGLE_CUSTOM_SEARCH_API_KEY;
  const searchEngineId = process.env.GOOGLE_CUSTOM_SEARCH_ENGINE_ID;
  if (!apiKey || !searchEngineId) {
    throw new Error("GOOGLE_CUSTOM_SEARCH_API_KEY or GOOGLE_CUSTOM_SEARCH_ENGINE_ID is not set.");
  }
  const url = `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(apiKey)}&cx=${encodeURIComponent(searchEngineId)}&q=${encodeURIComponent(query)}&num=${Math.min(numResults, 10)}`;
  const response = await fetch(url);
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Google Custom Search API returned ${response.status}: ${body.slice(0, 200)}`);
  }
  const data = await response.json();
  const results = (data.items || []).map((item) => ({
    title: item.title || "",
    link: item.link || "",
    snippet: item.snippet || "",
  }));
  return { results, answerBox: null };
}

// Merges a newly-found list of {title, url, ...} items into an
// existing one, de-duplicated by url -- existing items are kept
// as-is (their url is the identity); only genuinely new urls get
// appended.
function mergeByUrl(existingItems, newItems) {
  const existing = Array.isArray(existingItems) ? existingItems : [];
  const seen = new Set(existing.map((item) => item.url).filter(Boolean));
  const merged = [...existing];
  for (const item of Array.isArray(newItems) ? newItems : []) {
    if (item.url && !seen.has(item.url)) {
      merged.push(item);
      seen.add(item.url);
    }
  }
  return merged;
}

// Shared by both entry types -- 5 real, targeted searches (syllabus,
// past papers, model answers/mark schemes, textbooks, revision/study
// guides), same wide coverage for both a country and an international
// system now that there's comfortable daily quota headroom for it.
async function gatherRealData(topicQueryPrefix, subject, gradeBand) {
  const [syllabusResult, papersResult, modelAnswersResult, textbookResult, studyGuideResult] = await Promise.all([
    performGoogleSearch(`${topicQueryPrefix} ${subject} syllabus specification ${gradeBand}`, 3),
    performGoogleSearch(`${topicQueryPrefix} ${subject} past papers`, 5),
    performGoogleSearch(`${topicQueryPrefix} ${subject} model answers mark scheme`, 4),
    performGoogleSearch(`${topicQueryPrefix} ${subject} recommended textbook`, 3),
    performGoogleSearch(`${topicQueryPrefix} ${subject} revision study guide notes`, 3),
  ]);

  const syllabusSummary = syllabusResult.results.slice(0, 2).map((r) => r.snippet).filter(Boolean).join(" ");

  const newPastPapers = [
    ...papersResult.results.slice(0, 4).map((r) => ({ title: r.title, url: r.link, snippet: r.snippet, kind: "past paper" })),
    ...modelAnswersResult.results.slice(0, 3).map((r) => ({ title: r.title, url: r.link, snippet: r.snippet, kind: "model answers / mark scheme" })),
  ];
  const newTextbookReferences = [
    ...textbookResult.results.slice(0, 3).map((r) => ({ title: r.title, url: r.link, kind: "textbook" })),
    ...studyGuideResult.results.slice(0, 3).map((r) => ({ title: r.title, url: r.link, kind: "study guide" })),
  ];
  const newSourceUrls = [
    ...syllabusResult.results, ...papersResult.results, ...modelAnswersResult.results,
    ...textbookResult.results, ...studyGuideResult.results,
  ].map((r) => r.link).filter(Boolean);

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
