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
//      .github/workflows/monthly-exam-cache-refresh.yml).
//
// PER EXPLICIT REQUEST: this no longer uses OpenAI at all -- OpenAI
// was only ever being used here to ORGANIZE/SUMMARIZE real search
// results into tidy prose, not to find anything itself; the actual
// information always came from real web searches. Removed entirely to
// cut this job's real, ongoing cost to zero beyond the search API
// itself (which the app already pays for regardless of this feature,
// via SERPER_API_KEY -- see webSearch.js -- and this job's ~180
// queries/month is comfortably inside Serper's free 2,500/month tier).
// The real, honest tradeoff: syllabusSummary is now Google's own
// "answer box" when one exists, or raw combined search snippets
// otherwise, instead of an AI-written paragraph -- less polished
// prose, but genuinely MORE trustworthy in one specific way: there's
// no AI step that could subtly misrepresent or paraphrase the real
// results, just the real results themselves, directly.
//
// For each (exam system, subject, grade band) in
// examSystemCacheSeedList.js, this makes 3 real, targeted searches
// (syllabus, past papers, textbooks) and writes the real results to
// Firestore. server.js's /chat handler reads this cache (see the
// SCHOOL AND STUDENTS CACHE LOOKUP block) to give faster, richer
// answers for these common combinations, while still doing its own
// live per-question search (via the model, as before) for the
// specific question itself.

import admin from "firebase-admin";
import { getFirebaseAdmin } from "./adminUsers.js";
import { performWebSearch } from "./webSearch.js";
import { buildSeedList, cacheDocId } from "./examSystemCacheSeedList.js";

function getDb() {
  getFirebaseAdmin(); // ensures admin.initializeApp() has actually run -- throws a clear error if FIREBASE_SERVICE_ACCOUNT_JSON is missing, same as adminUsers.js's own routes do
  return admin.firestore();
}

async function refreshOneEntry({ examSystem, subject, gradeBand }) {
  const docId = cacheDocId(examSystem, subject, gradeBand);
  console.log(`Refreshing: ${docId}`);

  // Three separate, narrowly-targeted real searches -- one per kind of
  // information -- rather than one broad search and hoping an AI could
  // sort out three different things from it (which is what the old,
  // OpenAI-based version effectively did).
  const [syllabusResult, papersResult, textbookResult] = await Promise.all([
    performWebSearch(`${examSystem} ${subject} syllabus specification ${gradeBand}`, 3),
    performWebSearch(`${examSystem} ${subject} past papers`, 5),
    performWebSearch(`${examSystem} ${subject} recommended textbook`, 3),
  ]);

  // Prefers Google's own "answer box" when one exists (usually a
  // clean, short, real summary) -- falls back to combining the top
  // couple of real snippets when there isn't one. Either way, this is
  // the real search provider's own text, not AI-generated.
  const syllabusSummary = syllabusResult.answerBox && syllabusResult.answerBox.answer
    ? syllabusResult.answerBox.answer
    : syllabusResult.results.slice(0, 2).map((r) => r.snippet).filter(Boolean).join(" ");

  const pastPapers = papersResult.results.slice(0, 4).map((r) => ({
    title: r.title,
    url: r.link,
    snippet: r.snippet,
  }));

  const textbookReferences = textbookResult.results.slice(0, 3).map((r) => ({
    title: r.title,
    url: r.link,
  }));

  const sourceUrls = [
    ...syllabusResult.results.map((r) => r.link),
    ...papersResult.results.map((r) => r.link),
    ...textbookResult.results.map((r) => r.link),
  ].filter(Boolean);

  const db = getDb();
  await db.collection("examSystemCache").doc(docId).set({
    examSystem,
    subject,
    gradeBand,
    syllabusSummary,
    pastPapers,
    textbookReferences,
    sourceUrls,
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
  const seedList = buildSeedList();
  console.log(`Starting refresh of ${seedList.length} exam-system cache entries...`);
  let succeeded = 0;
  let skipped = 0;
  const failures = [];
  for (const entry of seedList) {
    try {
      const result = await refreshOneEntry(entry);
      if (result.skipped) skipped++;
      else succeeded++;
    } catch (err) {
      const docId = cacheDocId(entry.examSystem, entry.subject, entry.gradeBand);
      console.error(`  Failed to refresh ${docId}:`, err.message);
      skipped++;
      failures.push({ docId, error: err.message });
    }
    // A small pause between entries -- purely to be a good citizen
    // toward the search API's own rate limits, not for any OpenAI-
    // related reason now that this job no longer calls OpenAI at all.
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  const summary = { total: seedList.length, succeeded, skipped, failures };
  console.log(`Done. ${succeeded} refreshed, ${skipped} skipped/failed.`);
  return summary;
}
