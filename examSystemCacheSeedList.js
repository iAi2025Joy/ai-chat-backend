// examSystemCacheSeedList.js
// ====================
//
// The curated list of (exam system, subject, grade band) combinations
// that refreshExamSystemCache.js keeps up to date every month.
//
// DELIBERATELY SMALL TO START -- this is Phase 1, not "every system for
// every country" (see the real cost/staleness/copyright discussion this
// came out of). Six major INTERNATIONAL systems x five core subjects x
// two grade bands = 60 entries, a genuinely sustainable monthly cost.
// National/regional systems (Tawjihi, Thanaweya Amma, and every other
// country's own system) deliberately are NOT in this seed list --
// they're better served by the LIVE per-question search School and
// Students mode already does (see server.js's SCHOOL AND STUDENTS
// system prompt), since those change on each ministry's own schedule,
// not a fixed monthly cadence, and a stale cached entry could actively
// mislead a student about a national exam.
//
// TO EXPAND LATER: just add more entries here -- no other code needs
// to change. Adding a country's national system is possible too, just
// go in deliberately (real staleness-risk tradeoff above) rather than
// all at once.

export const EXAM_SYSTEMS = ["IGCSE", "SAT", "ACT", "IB", "AP", "A-Levels"];

export const CORE_SUBJECTS = ["Math", "Physics", "Chemistry", "Biology", "English"];

export const GRADE_BANDS = ["Grade 9-10", "Grade 11-12"];

export function buildSeedList() {
  const seedList = [];
  for (const examSystem of EXAM_SYSTEMS) {
    for (const subject of CORE_SUBJECTS) {
      for (const gradeBand of GRADE_BANDS) {
        seedList.push({ examSystem, subject, gradeBand });
      }
    }
  }
  return seedList;
}

// The exact same normalization used both when WRITING a cache entry
// (refreshExamSystemCache.js) and when READING one back to match a
// real student's selections (server.js's /chat handler) -- these two
// must stay byte-for-byte consistent, or a written entry would never
// actually get found again.
export function cacheDocId(examSystem, subject, gradeBand) {
  const clean = (s) => (s || "").trim().replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `${clean(examSystem)}_${clean(subject)}_${clean(gradeBand)}`;
}

// Maps a student's own free-form grade selection (e.g. "Grade 9" from
// the School wizard's dropdown) to the matching grade band used by the
// cache -- the wizard offers individual grades, the cache groups them
// in twos to keep the seed list a manageable size.
export function gradeToGradeBand(grade) {
  const match = (grade || "").match(/(\d+)/);
  if (!match) return null;
  const n = parseInt(match[1], 10);
  if (n >= 9 && n <= 10) return "Grade 9-10";
  if (n >= 11 && n <= 12) return "Grade 11-12";
  return null; // KG1/KG2/Grade 1-8/University -- not covered by this Phase 1 seed list
}
