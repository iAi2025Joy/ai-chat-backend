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
// Runs TWO seed lists (see examSystemCacheSeedList.js):
//   - buildInternationalSeedList() -- 6 major international systems,
//     3 real searches each (syllabus, past papers, textbooks).
//   - buildArabicCountrySeedList() -- the 22 Arab League countries'
//     own national systems, with WIDER coverage per explicit request
//     (5 real searches each: syllabus, past papers, model
//     answers/mark schemes, textbooks, and revision/study guides) --
//     every OTHER country still deliberately relies on live per-
//     question search only, see the seed list file's own comment on
//     why.
//
// PER EXPLICIT REQUEST: each monthly run now ACCUMULATES real findings
// rather than overwriting them -- reads whatever's already cached for
// an entry first, merges in this run's newly-found real papers/
// references (de-duplicated by URL, so the same real result found
// again doesn't create a duplicate entry), and writes the MERGED list
// back. Over several months, an entry's real paper/reference list can
// genuinely grow as new content is published and found, rather than
// only ever reflecting whatever a single month's searches happened to
// surface. syllabusSummary is the one exception -- it's replaced with
// the latest real summary each run (an accumulating summary doesn't
// make sense the way an accumulating list of real papers does),
// unless this run's search came back empty, in which case the
// previous real summary is kept rather than being wiped out.
//
// HONEST SCOPE NOTE ON "all free sources": this searches more
// comprehensively through the one real search tool this app has
// (Serper/Google search) -- it does not integrate a second, different
// search provider, which would be new infrastructure (and potentially
// new cost) not built here without a separate discussion first.
//
// Uses only the search API directly (no OpenAI) -- OpenAI was only
// ever organizing/summarizing real search results here, never finding
// anything itself, so removing it (an earlier change) cuts this job's
// real, ongoing cost to zero beyond the search API (already paid for
// via SERPER_API_KEY regardless of this feature). Real query volume:
// international (60 entries x 3) + country (220 entries x 5) = 1,280
// searches/month, comfortably inside Serper's free 2,500/month tier.

import admin from "firebase-admin";
import { getFirebaseAdmin } from "./adminUsers.js";
import { performWebSearch } from "./webSearch.js";
import {
  buildInternationalSeedList,
  buildArabicCountrySeedList,
  cacheDocId,
  countryCacheDocId,
} from "./examSystemCacheSeedList.js";

function getDb() {
  getFirebaseAdmin(); // ensures admin.initializeApp() has actually run -- throws a clear error if FIREBASE_SERVICE_ACCOUNT_JSON is missing, same as adminUsers.js's own routes do
  return admin.firestore();
}

// Merges a newly-found list of {title, url, ...} items into an
// existing one, de-duplicated by url -- shared by both pastPapers and
// textbookReferences merging below. Existing items are kept as-is
// (their url is the identity); only genuinely new urls get appended.
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

async function gatherInternationalData(examSystem, subject, gradeBand) {
  const [syllabusResult, papersResult, textbookResult] = await Promise.all([
    performWebSearch(`${examSystem} ${subject} syllabus specification ${gradeBand}`, 3),
    performWebSearch(`${examSystem} ${subject} past papers`, 5),
    performWebSearch(`${examSystem} ${subject} recommended textbook`, 3),
  ]);

  const syllabusSummary = syllabusResult.answerBox && syllabusResult.answerBox.answer
    ? syllabusResult.answerBox.answer
    : syllabusResult.results.slice(0, 2).map((r) => r.snippet).filter(Boolean).join(" ");

  const newPastPapers = papersResult.results.slice(0, 4).map((r) => ({ title: r.title, url: r.link, snippet: r.snippet }));
  const newTextbookReferences = textbookResult.results.slice(0, 3).map((r) => ({ title: r.title, url: r.link }));
  const newSourceUrls = [...syllabusResult.results, ...papersResult.results, ...textbookResult.results].map((r) => r.link).filter(Boolean);

  return { syllabusSummary, newPastPapers, newTextbookReferences, newSourceUrls };
}

// Wider coverage for country entries, per explicit request -- 5 real
// searches instead of 3: adds a model-answers/mark-scheme search (a
// real, distinct thing from the raw past paper question text) and a
// revision/study-guide search (broadens "free sources" coverage
// beyond just official ministry material to legitimate free student
// study resources too).
async function gatherCountryData(country, subject, gradeBand) {
  const topic = `${country} national curriculum ministry of education`;
  const [syllabusResult, papersResult, modelAnswersResult, textbookResult, studyGuideResult] = await Promise.all([
    performWebSearch(`${topic} ${subject} syllabus specification ${gradeBand}`, 3),
    performWebSearch(`${topic} ${subject} past papers`, 5),
    performWebSearch(`${topic} ${subject} model answers mark scheme`, 4),
    performWebSearch(`${topic} ${subject} recommended textbook`, 3),
    performWebSearch(`${topic} ${subject} revision study guide notes`, 3),
  ]);

  const syllabusSummary = syllabusResult.answerBox && syllabusResult.answerBox.answer
    ? syllabusResult.answerBox.answer
    : syllabusResult.results.slice(0, 2).map((r) => r.snippet).filter(Boolean).join(" ");

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

// Shared by both entry types -- reads whatever's already cached (if
// anything), merges this run's newly-found real results into it, and
// writes the merged data back. This is the actual "find any new data
// and add it" behavior -- a genuine accumulation across months, not a
// fresh snapshot that discards everything found in prior runs.
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

async function refreshOneInternationalEntry({ examSystem, subject, gradeBand }) {
  const docId = cacheDocId(examSystem, subject, gradeBand);
  console.log(`Refreshing: ${docId}`);
  const gathered = await gatherInternationalData(examSystem, subject, gradeBand);
  await mergeAndSave(getDb(), docId, { entryType: "international", examSystem, subject, gradeBand }, gathered);
  console.log(`  Saved ${docId} (${gathered.newPastPapers.length} new paper candidates checked for merge)`);
  return { docId, skipped: false };
}

async function refreshOneCountryEntry({ country, subject, gradeBand }) {
  const docId = countryCacheDocId(country, subject, gradeBand);
  console.log(`Refreshing: ${docId}`);
  const gathered = await gatherCountryData(country, subject, gradeBand);
  await mergeAndSave(getDb(), docId, { entryType: "country", country, subject, gradeBand }, gathered);
  console.log(`  Saved ${docId} (${gathered.newPastPapers.length} new paper/answer candidates checked for merge)`);
  return { docId, skipped: false };
}

async function runOneSeedList(seedList, refreshFn, docIdFn) {
  let succeeded = 0;
  let skipped = 0;
  const failures = [];
  for (const entry of seedList) {
    try {
      const result = await refreshFn(entry);
      if (result.skipped) skipped++;
      else succeeded++;
    } catch (err) {
      const docId = docIdFn(entry);
      console.error(`  Failed to refresh ${docId}:`, err.message);
      skipped++;
      failures.push({ docId, error: err.message });
    }
    // A small pause between entries -- being a good citizen toward the
    // search API's own rate limits.
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return { succeeded, skipped, failures };
}

// The single shared entry point both the standalone script and the
// HTTP endpoint call -- runs BOTH seed lists start to finish and
// returns a real combined summary.
export async function runExamSystemCacheRefresh() {
  const internationalSeedList = buildInternationalSeedList();
  const countrySeedList = buildArabicCountrySeedList();
  const total = internationalSeedList.length + countrySeedList.length;
  console.log(`Starting refresh of ${total} exam-system cache entries (${internationalSeedList.length} international, ${countrySeedList.length} Arabic-country)...`);

  const internationalResult = await runOneSeedList(
    internationalSeedList,
    refreshOneInternationalEntry,
    (e) => cacheDocId(e.examSystem, e.subject, e.gradeBand)
  );
  const countryResult = await runOneSeedList(
    countrySeedList,
    refreshOneCountryEntry,
    (e) => countryCacheDocId(e.country, e.subject, e.gradeBand)
  );

  const summary = {
    total,
    succeeded: internationalResult.succeeded + countryResult.succeeded,
    skipped: internationalResult.skipped + countryResult.skipped,
    failures: [...internationalResult.failures, ...countryResult.failures],
    breakdown: {
      international: { total: internationalSeedList.length, ...internationalResult },
      arabicCountries: { total: countrySeedList.length, ...countryResult },
    },
  };
  console.log(`Done. ${summary.succeeded} refreshed, ${summary.skipped} skipped/failed.`);
  return summary;
}
