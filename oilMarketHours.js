// oilMarketHours.js
// ====================
//
// WTI crude oil futures (CME/NYMEX Globex) trade nearly continuously
// through the week, Sunday 6:00 PM ET through Friday 5:00 PM ET --
// SAME broad weekly pattern as gold's real global market -- but ALSO
// pause for a genuine 1-hour daily maintenance break each trading day
// (5:00-6:00 PM ET, Monday through Thursday), which gold's spot market
// does not have. This module is shared by oilPrediction.js and
// liveOilPrice.js so both tools use the identical, single source of
// truth for oil's real schedule, rather than two separate
// implementations that could silently drift apart.
//
// NOTE: does not account for the rare holiday closure -- a real,
// acknowledged simplification, same as gold's equivalent module.

function isOilMarketOpenAt(checkDate) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(checkDate);

  const weekdayNames = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dayIndex = weekdayNames[parts.find((p) => p.type === "weekday").value];
  // % 24 normalizes a real, confirmed Intl/ICU quirk (same fix applied
  // to gold's identical market-hours pattern in goldPrediction.js, see
  // that file's comment for the full explanation and how it was
  // confirmed): hour12:false can format the midnight hour as "24"
  // instead of "0" in the en-US locale, which would otherwise flip this
  // check to incorrectly report the market OPEN during 00:00-00:59 ET.
  const hour = parseInt(parts.find((p) => p.type === "hour").value, 10) % 24;
  const minute = parseInt(parts.find((p) => p.type === "minute").value, 10);
  const minutesSinceSundayMidnightET = dayIndex * 1440 + hour * 60 + minute;

  // Five daily trading sessions: Sun 6PM->Mon 5PM, Mon 6PM->Tue 5PM,
  // Tue 6PM->Wed 5PM, Wed 6PM->Thu 5PM, Thu 6PM->Fri 5PM -- each
  // separated by the 1-hour daily maintenance break, with the last
  // session's 5PM Friday close starting the full weekend closure.
  for (let d = 0; d <= 4; d++) {
    const sessionOpen = d * 1440 + 18 * 60; // that day, 6:00 PM ET
    const sessionClose = (d + 1) * 1440 + 17 * 60; // next day, 5:00 PM ET
    if (minutesSinceSundayMidnightET >= sessionOpen && minutesSinceSundayMidnightET < sessionClose) {
      return true;
    }
  }
  return false;
}

// Same brute-force forward search technique as gold's equivalent --
// avoids manual timezone/DST arithmetic entirely. Max realistic closure
// is the weekend gap (~49 hours) or the 1-hour daily break, both well
// within this search's range.
function findNextOilMarketOpen(fromDate) {
  let candidate = new Date(fromDate);
  for (let i = 0; i < 1000; i++) {
    if (isOilMarketOpenAt(candidate)) return candidate;
    candidate = new Date(candidate.getTime() + 5 * 60 * 1000);
  }
  return null;
}

export function getOilMarketStatus(nowUtc, safeTimezone) {
  const isOpen = isOilMarketOpenAt(nowUtc);
  let nextOpenAt = null;
  let formattedNextOpenAt = null;

  if (!isOpen) {
    nextOpenAt = findNextOilMarketOpen(nowUtc);
    if (nextOpenAt) {
      formattedNextOpenAt = nextOpenAt.toLocaleString(undefined, {
        weekday: "long", year: "numeric", month: "short", day: "numeric",
        hour: "2-digit", minute: "2-digit", timeZoneName: "short",
        timeZone: safeTimezone,
      });
    }
  }

  return { isOpen, nextOpenAt, formattedNextOpenAt };
}
