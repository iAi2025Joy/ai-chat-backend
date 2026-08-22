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
// Runs TWO seed lists now (see examSystemCacheSeedList.js):
//   - buildInternationalSeedList() -- 6 major international systems.
//   - buildArabicCountrySeedList() -- the 22 Arab League countries'
//     own national systems, added per explicit request. Every OTHER
//     country still deliberately relies on live per-question search
//     only -- see the seed list file's own comment on why.
//
// Uses only the search API directly (no OpenAI) -- see the prior
// version's own comment on why that was removed: OpenAI was only ever
// organizing/summarizing real search results here, never finding
// anything itself, so removing it cuts real, ongoing cost to zero
// beyond the search API (already paid for via SERPER_API_KEY
// regardless of this feature, and this job's real query volume stays
// comfortably inside Serper's free tier even with both seed lists).

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

// Shared by both entry types below -- runs the three real searches and
// shapes their results the same way regardless of whether the "topic"
// searched for is an international exam system's name or a country's
// national system.
async function gatherRealData(topicQueryPrefix, subject, gradeBand) {
  const [syllabusResult, papersResult, textbookResult] = await Promise.all([
    performWebSearch(`${topicQueryPrefix} ${subject} syllabus specification ${gradeBand}`, 3),
    performWebSearch(`${topicQueryPrefix} ${subject} past papers`, 5),
    performWebSearch(`${topicQueryPrefix} ${subject} recommended textbook`, 3),
  ]);

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

  return { syllabusSummary, pastPapers, textbookReferences, sourceUrls };
}

async function refreshOneInternationalEntry({ examSystem, subject, gradeBand }) {
  const docId = cacheDocId(examSystem, subject, gradeBand);
  console.log(`Refreshing: ${docId}`);
  const data = await gatherRealData(examSystem, subject, gradeBand);
  const db = getDb();
  await db.collection("examSystemCache").doc(docId).set({
    entryType: "international",
    examSystem,
    subject,
    gradeBand,
    ...data,
    lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
  });
  console.log(`  Saved ${docId}`);
  return { docId, skipped: false };
}

async function refreshOneCountryEntry({ country, subject, gradeBand }) {
  const docId = countryCacheDocId(country, subject, gradeBand);
  console.log(`Refreshing: ${docId}`);
  // Includes "ministry of education" in the query -- real, targeted
  // phrasing for finding a country's own official curriculum source,
  // the same real search-phrasing approach the live per-question
  // search already uses for national systems (see server.js's SCHOOL
  // AND STUDENTS system prompt).
  const data = await gatherRealData(`${country} national curriculum ministry of education`, subject, gradeBand);
  const db = getDb();
  await db.collection("examSystemCache").doc(docId).set({
    entryType: "country",
    country,
    subject,
    gradeBand,
    ...data,
    lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
  });
  console.log(`  Saved ${docId}`);
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
