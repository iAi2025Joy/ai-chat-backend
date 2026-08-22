// refreshExamSystemCache.js
// ====================
//
// Standalone entry point -- run manually/locally with:
//   node refreshExamSystemCache.js
// (needs FIREBASE_SERVICE_ACCOUNT_JSON and SERPER_API_KEY -- the same
// two environment variables server.js itself already uses. No longer
// needs OPENAI_API_KEY -- this job doesn't call OpenAI at all anymore,
// see examSystemCacheRefresher.js's own comment on why.)
//
// This is now a thin wrapper around examSystemCacheRefresher.js's
// exported runExamSystemCacheRefresh() -- the SAME function the free
// monthly GitHub Actions workflow triggers via the protected
// POST /admin/refresh-exam-cache endpoint in server.js. Kept as a
// separate file purely for convenience (a direct, memorable command
// to run this by hand) -- all the real logic lives in one place.

import { runExamSystemCacheRefresh } from "./examSystemCacheRefresher.js";

runExamSystemCacheRefresh().catch((err) => {
  console.error("Fatal error in refreshExamSystemCache.js:", err);
  process.exit(1);
});
