// examSystemCacheSeedList.js
// ====================
//
// PER EXPLICIT REQUEST: the cache now refreshes on a DAILY rotation --
// one item (a country OR an international system) per day, cycling
// through all 28 items forever, then starting over. This replaced the
// earlier "everything in one monthly burst" approach specifically
// because a single burst of ~1,280 queries exceeded what a free
// search-API tier can sustain in one sitting -- ~50 queries for a
// single day's item comfortably fits within a real, recurring free
// daily quota (see examSystemCacheRefresher.js for the actual search
// calls).
//
// ROTATION ORDER: Jordan first (as explicitly requested), then the
// rest of the 22 Arab League countries, then the 6 international
// systems, then the whole sequence repeats indefinitely. No stored
// "where did we leave off" state is needed -- today's item is picked
// deterministically from the real calendar date (days since epoch,
// modulo the rotation length), so the rotation is self-healing: even
// if a day's run is missed entirely, the next run just reflects
// whatever day it actually is, rather than needing to catch up.

export const EXAM_SYSTEMS = ["IGCSE", "SAT", "ACT", "IB", "AP", "A-Levels"];

// Jordan moved to the front per explicit request; the rest of the 22
// Arab League countries follow in their original order.
export const ARABIC_COUNTRIES = [
  "Jordan",
  "Algeria", "Bahrain", "Comoros", "Djibouti", "Egypt", "Iraq",
  "Kuwait", "Lebanon", "Libya", "Mauritania", "Morocco", "Oman", "Palestine",
  "Qatar", "Saudi Arabia", "Somalia", "Sudan", "Syria", "Tunisia",
  "United Arab Emirates", "Yemen",
];

export const CORE_SUBJECTS = ["Math", "Physics", "Chemistry", "Biology", "English"];

export const GRADE_BANDS = ["Grade 9-10", "Grade 11-12"];

// The full 28-item rotation, in exact order per explicit request:
// Jordan alone first, then the 6 international systems (IGCSE, SAT,
// ACT, IB, AP, A-Levels), then the remaining 21 Arab countries in
// their existing order -- then the whole 28-day cycle repeats.
export function buildRotationList() {
  const [jordan, ...restOfCountries] = ARABIC_COUNTRIES; // Jordan is already first in ARABIC_COUNTRIES
  return [
    { type: "country", country: jordan },
    ...EXAM_SYSTEMS.map((examSystem) => ({ type: "international", examSystem })),
    ...restOfCountries.map((country) => ({ type: "country", country })),
  ];
}

// Deterministically picks today's rotation item from the real
// calendar date -- see the file header comment on why this needs no
// persisted state.
export function getTodaysRotationItem() {
  const rotationList = buildRotationList();
  const daysSinceEpoch = Math.floor(Date.now() / 86400000);
  const todayIndex = daysSinceEpoch % rotationList.length;
  return rotationList[todayIndex];
}

// All (subject, gradeBand) combinations for a single rotation item --
// 10 entries (5 subjects x 2 grade bands), refreshed together on that
// item's day.
export function buildSubjectGradeCombos() {
  const combos = [];
  for (const subject of CORE_SUBJECTS) {
    for (const gradeBand of GRADE_BANDS) {
      combos.push({ subject, gradeBand });
    }
  }
  return combos;
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
