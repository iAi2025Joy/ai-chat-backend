// refreshExamSystemCache.js
// ====================
//
// Standalone entry point -- run manually/locally with:
//   node refreshExamSystemCache.js
// (needs FIREBASE_SERVICE_ACCOUNT_JSON and TAVILY_API_KEY1 -- the same
// environment variables server.js itself already uses. No longer
// needs OPENAI_API_KEY, SERPER_API_KEY, or the Google Custom Search
// variables from an earlier version -- this job now uses Tavily's
// Search API directly, see examSystemCacheRefresher.js's own comment
// on why.)
//
// Refreshes ONE rotation item per run now (a single country or a
// single international system, picked deterministically by the real
// calendar date) -- see examSystemCacheRefresher.js and
// examSystemCacheSeedList.js for the full "why".
//
// This is now a thin wrapper around examSystemCacheRefresher.js's
// exported runExamSystemCacheRefresh() -- the SAME function the free
// daily GitHub Actions workflow triggers via the protected
// POST /admin/refresh-exam-cache endpoint in server.js. Kept as a
// separate file purely for convenience (a direct, memorable command
// to run this by hand) -- all the real logic lives in one place.

import { runExamSystemCacheRefresh } from "./examSystemCacheRefresher.js";

runExamSystemCacheRefresh().catch((err) => {
  console.error("Fatal error in refreshExamSystemCache.js:", err);
  process.exit(1);
});
