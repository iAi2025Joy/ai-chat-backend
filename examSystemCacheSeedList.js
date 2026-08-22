// examSystemCacheSeedList.js
// ====================
//
// The curated lists that refreshExamSystemCache.js keeps up to date
// every month -- TWO separate seed lists now, per explicit request:
//
//   1. buildInternationalSeedList() -- 6 major international systems
//      (unchanged from Phase 1).
//   2. buildArabicCountrySeedList() -- the 22 Arab League countries'
//      own national systems, added per explicit request now that the
//      refresh job costs nothing beyond free-tier search calls (see
//      examSystemCacheRefresher.js's own comment on removing OpenAI).
//
// Every OTHER country in the world still deliberately relies on LIVE
// per-question search only (see server.js's SCHOOL AND STUDENTS system
// prompt) -- the same real staleness-risk reasoning as before still
// applies to them: a national exam system can update its syllabus or
// past papers on its own schedule, not a fixed monthly one, and a
// stale cached entry could actively mislead a student. The 22 Arabic
// countries are a deliberate, bounded exception, not a change to that
// reasoning for everyone else.
//
// TO EXPAND LATER: add more countries to ARABIC_COUNTRIES (or start a
// third seed list for a different region) -- no other code needs to
// change beyond that.

export const EXAM_SYSTEMS = ["IGCSE", "SAT", "ACT", "IB", "AP", "A-Levels"];

// The 22 Arab League member states, in full official English names --
// matching this exact list (not abbreviations) is what the School
// wizard's own WORLD_COUNTRIES dropdown already uses, so a student's
// selection lines up with these entries without any extra mapping.
export const ARABIC_COUNTRIES = [
  "Algeria", "Bahrain", "Comoros", "Djibouti", "Egypt", "Iraq", "Jordan",
  "Kuwait", "Lebanon", "Libya", "Mauritania", "Morocco", "Oman", "Palestine",
  "Qatar", "Saudi Arabia", "Somalia", "Sudan", "Syria", "Tunisia",
  "United Arab Emirates", "Yemen",
];

export const CORE_SUBJECTS = ["Math", "Physics", "Chemistry", "Biology", "English"];

export const GRADE_BANDS = ["Grade 9-10", "Grade 11-12"];

export function buildInternationalSeedList() {
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

export function buildArabicCountrySeedList() {
  const seedList = [];
  for (const country of ARABIC_COUNTRIES) {
    for (const subject of CORE_SUBJECTS) {
      for (const gradeBand of GRADE_BANDS) {
        seedList.push({ country, subject, gradeBand });
      }
    }
  }
  return seedList;
}

// The exact same normalization used both when WRITING a cache entry
// (examSystemCacheRefresher.js) and when READING one back to match a
// real student's selections (server.js's /chat handler) -- these two
// must stay byte-for-byte consistent, or a written entry would never
// actually get found again.
export function cacheDocId(examSystem, subject, gradeBand) {
  const clean = (s) => (s || "").trim().replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `${clean(examSystem)}_${clean(subject)}_${clean(gradeBand)}`;
}

// Same idea, for a country-based entry -- prefixed distinctly (COUNTRY-)
// so international-system and country-based docs can never collide,
// even if an exam system name and a country name happened to be
// spelled the same way.
export function countryCacheDocId(country, subject, gradeBand) {
  const clean = (s) => (s || "").trim().replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `COUNTRY-${clean(country)}_${clean(subject)}_${clean(gradeBand)}`;
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
