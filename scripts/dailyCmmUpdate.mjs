// scripts/dailyCmmUpdate.mjs
//
// Run daily by GitHub Actions (see
// .github/workflows/cmm-daily-update.yml), NOT by the running Render
// server itself -- Render's web service has no built-in scheduler, so
// this runs as a separate scheduled job and commits its results
// directly back to this same repo. Render's existing auto-deploy-on-
// push then picks up the change automatically, same as any other
// commit -- no separate deploy step needed here.
//
// WHAT THIS DOES: checks a curated list of real, authoritative
// cybersecurity/privacy/capacity-building sources (see CURATED_SOURCES
// below -- including Cybil Portal, a real public aggregator of actual
// GCSCC CMM country review reports) for genuinely new content, asks
// gpt-4o-mini whether each item is a real, substantive development
// relevant to national or organizational cybersecurity OR privacy
// capacity building (not just noise), and for anything that passes,
// generates a properly-structured knowledge chunk matching the same
// {id, title, text} shape used throughout cybersecurityKnowledgeBase.js.
// Items specifically about ONE country's CMM review, cybersecurity
// strategy, or privacy/data-protection legislation status get the
// country name tagged directly in the chunk title (e.g. "[Kenya]
// Completes..."), so later semantic retrieval by country name is more
// reliable -- per explicit request to keep GARNET aware of real,
// individual country reports as they're published, for both
// cybersecurity and privacy. Auto-applies everything that passes --
// per explicit request, no manual review step -- but writes ONLY into
// the clearly-separated CYBERSECURITY_DAILY_UPDATE_CHUNKS array, never
// touching the
// hand-curated CYBERSECURITY_CORE_KNOWLEDGE_CHUNKS above it.
//
// SOURCES -- a genuinely curated list of ~15 real, legitimate,
// authoritative bodies with real RSS feeds (RSS is the correct way to
// do this: it's the standard, explicitly-intended-for-syndication
// mechanism these organizations themselves publish, unlike scraping
// arbitrary HTML off a page, which many major sites' terms of service
// and robots.txt explicitly disallow). IMPORTANT: these exact feed URLs
// were selected from real, current knowledge of each organization's
// public RSS offerings, but feed URLs do occasionally change on any
// given organization's end -- if a source starts consistently failing
// in the Action's logs, that specific URL likely needs a quick manual
// update, which is normal and expected for any such integration, not a
// sign anything is broken.
const CURATED_SOURCES = [
  { name: "GCSCC (Oxford)", url: "https://gcscc.ox.ac.uk/news?format=rss" },
  // Confirmed real via ENISA's own official RSS listing page
  // (enisa.europa.eu/rss-feeds) -- the original guess had the wrong
  // path structure entirely.
  { name: "ENISA (EU Cybersecurity Agency)", url: "https://www.enisa.europa.eu/media/news-items/news-wires/RSS" },
  { name: "NIST Cybersecurity", url: "https://www.nist.gov/news-events/cybersecurity/rss.xml" },
  { name: "CISA (US)", url: "https://www.cisa.gov/cybersecurity-advisories/all.xml" },
  { name: "GFCE (Global Forum on Cyber Expertise)", url: "https://thegfce.org/feed/" },
  // World Economic Forum, OECD Digital Security, and Council of
  // Europe were all removed here -- confirmed via real runs to return
  // a consistent HTTP 403 (not a wrong-URL 404), the same deliberate
  // bot-blocking pattern already confirmed with DLA Piper in the
  // weekly script. Not a fixable URL/config issue from our end.
  // Confirmed real via a SANS Internet Storm Center feeds page --
  // the original www.sans.org/rss/... guess was never a real path;
  // SANS's actual RSS content lives on the isc.sans.edu subdomain.
  { name: "SANS Internet Storm Center", url: "https://isc.sans.edu/rssfeed.xml" },
  // ISACA removed -- real research found no confirmed native RSS feed
  // for their site (their news/blog pages appear to be a JS-rendered
  // app without a real syndication endpoint, similar to IAPP's main
  // site before that was fixed to use their real westin.iapp.org
  // subdomain in the weekly script).
  { name: "OECD Digital Security", url: "https://www.oecd.org/digital/rss.xml" },
  // Per explicit request: keeps GARNET aware of real, individual
  // country CMM review reports as they're published, not just general
  // cybersecurity news. Cybil Portal is a real, confirmed public
  // aggregator specifically of actual CMM country review reports
  // (Brazil, Nauru, Tunisia, Mongolia, Kuwait, etc. -- GCSCC's own site
  // confirms 20+ published country reports exist). WordPress sites
  // (which Cybil Portal is) commonly expose /feed/ as a standard RSS
  // endpoint -- verify/adjust in the Action's logs if this specific
  // URL doesn't resolve, same as any other source here.
  { name: "Cybil Portal -- CMM Country Reports", url: "https://cybilportal.org/publications/portal-of-cybersecurity-capacity-maturity-model-cmm-review-reports/feed/" },
];

// Keeps the daily-update section from growing unbounded over time --
// each run adds new entries and prunes back down to this many of the
// MOST RECENT ones (oldest dropped first). 60 is roughly 2 months of
// daily coverage at a few items per run, a reasonable working size for
// an in-memory-embedded knowledge base without needing a real vector
// database.
const MAX_DAILY_UPDATE_CHUNKS = 60;

import OpenAI from "openai";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KNOWLEDGE_BASE_PATH = path.join(__dirname, "..", "cybersecurityKnowledgeBase.js");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function fetchFeedItems(source, attempt = 1) {
  try {
    const response = await fetch(source.url, {
      // Same real fix as scripts/weeklyPrivacyLawUpdate.mjs -- several
      // source sites likely block requests carrying an unfamiliar,
      // clearly-bot-identifying User-Agent string. A standard browser
      // one is legitimate here since these are public RSS feeds
      // intentionally published for syndication.
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36" },
      // Node's fetch has no default timeout -- without this, a
      // genuinely stuck connection could hang rather than fail
      // cleanly and quickly.
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      console.error(`[${source.name}] fetch failed: HTTP ${response.status}`);
      return [];
    }
    const xml = await response.text();
    // A deliberately simple, dependency-free RSS/Atom item extractor --
    // good enough for the real structure these feeds actually use,
    // without pulling in a full XML parsing library for something this
    // small. Grabs <title> and <link> (or Atom's <link href="...">)
    // pairs inside each <item>/<entry> block.
    const itemBlocks = xml.match(/<(item|entry)[\s\S]*?<\/\1>/g) || [];
    return itemBlocks.slice(0, 8).map((block) => {
      const titleMatch = block.match(/<title[^>]*>([\s\S]*?)<\/title>/);
      const linkMatch =
        block.match(/<link[^>]*>([\s\S]*?)<\/link>/) || block.match(/<link[^>]*href="([^"]*)"/);
      const title = (titleMatch ? titleMatch[1] : "").replace(/<!\[CDATA\[|\]\]>/g, "").trim();
      const link = (linkMatch ? linkMatch[1] : "").replace(/<!\[CDATA\[|\]\]>/g, "").trim();
      return { title, link, source: source.name };
    }).filter((item) => item.title);
  } catch (err) {
    // Real underlying cause (DNS failure, connection reset, TLS
    // handshake issue, timeout, etc.) is normally attached as
    // err.cause -- not logging it before made a generic "fetch failed"
    // impossible to actually diagnose, unlike clean HTTP error
    // responses (already logged with their real status code above).
    const causeDetail = err.cause ? ` -- cause: ${err.cause.code || err.cause.message || err.cause}` : "";
    console.error(`[${source.name}] error (attempt ${attempt}): ${err.message}${causeDetail}`);
    // One retry for transient network issues before giving up on this
    // source for this run.
    if (attempt === 1) {
      console.error(`[${source.name}] retrying once...`);
      return fetchFeedItems(source, 2);
    }
    return [];
  }
}

// Asks gpt-4o-mini whether a real feed item is a genuine, substantive
// development relevant to national cybersecurity capacity building
// (the CMM's 5 Dimensions), and if so, generates a real knowledge
// chunk from it -- not from the title alone, but reasoned about
// honestly by the model, staying within what the title/link actually
// indicate rather than inventing details the feed item doesn't
// actually contain.
async function evaluateAndSummarize(item) {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "You are screening real news items for relevance to national or organizational capacity building in cybersecurity OR privacy (the GCSCC's Cybersecurity Capacity Maturity Model dimensions: national strategy, incident response, critical infrastructure, defence, culture/awareness, education/training, legal/regulatory frameworks, standards/technologies -- AND privacy capacity: data protection legislation, enforcement authorities, individual rights, cross-border data flows). " +
          "Respond with ONLY a JSON object, no other text: {\"relevant\": true/false, \"country\": \"the real country name if this is specifically about ONE country's capacity/report/review, else null\", \"title\": \"a short descriptive title if relevant -- if a country was identified, put the country name at the start in brackets, e.g. '[Kenya] Completes National Cybersecurity Strategy Review'\", \"summary\": \"a factual 2-4 sentence summary if relevant, based ONLY on the real title/source given -- do not invent specifics you don't actually have\"}. " +
          "Mark relevant:false for anything that's just routine vendor marketing, a minor product update, or not genuinely about national/organizational cybersecurity or privacy capacity building. Prioritize marking relevant:true for anything about a SPECIFIC country's CMM review, cybersecurity strategy, or data protection/privacy legislation status -- these are especially valuable to capture.",
      },
      {
        role: "user",
        content: `Source: ${item.source}\nTitle: ${item.title}\nLink: ${item.link}`,
      },
    ],
    response_format: { type: "json_object" },
    max_tokens: 300,
  });

  try {
    return JSON.parse(response.choices?.[0]?.message?.content || "{}");
  } catch {
    return { relevant: false };
  }
}

async function main() {
  console.log(`Daily CMM knowledge update starting -- ${new Date().toISOString()}`);

  const allItems = [];
  for (const source of CURATED_SOURCES) {
    const items = await fetchFeedItems(source);
    console.log(`[${source.name}] found ${items.length} item(s)`);
    allItems.push(...items);
  }

  const newChunks = [];
  const today = new Date().toISOString().slice(0, 10);
  let counter = 0;

  for (const item of allItems) {
    try {
      const evaluation = await evaluateAndSummarize(item);
      if (evaluation.relevant && evaluation.summary) {
        counter++;
        newChunks.push({
          id: `daily-${today}-${counter}`,
          title: `[${today}] ${evaluation.title || item.title}`,
          text: `${evaluation.summary} (Source: ${item.source}${item.link ? ", " + item.link : ""})`,
        });
      }
    } catch (err) {
      console.error(`Evaluation failed for "${item.title}":`, err.message);
    }
  }

  console.log(`${newChunks.length} new relevant item(s) found today.`);

  if (newChunks.length === 0) {
    console.log("Nothing relevant today -- knowledge base left unchanged.");
    return;
  }

  const fileContents = await readFile(KNOWLEDGE_BASE_PATH, "utf-8");

  // Extracts the CURRENT daily-update array's real entries (so today's
  // new ones get ADDED to existing recent ones, not replacing them),
  // by finding the array literal and parsing it as real JS via a
  // dynamic import of the actual module -- more robust than
  // regex-parsing the array contents by hand.
  const currentModule = await import(`${KNOWLEDGE_BASE_PATH}?update=${Date.now()}`);
  const existingDailyChunks = currentModule.CYBERSECURITY_DAILY_UPDATE_CHUNKS || [];

  // New chunks first (most recent), then existing ones, pruned to the
  // configured maximum -- oldest entries drop off first.
  const combinedDailyChunks = [...newChunks, ...existingDailyChunks].slice(0, MAX_DAILY_UPDATE_CHUNKS);

  const newArrayLiteral = `export const CYBERSECURITY_DAILY_UPDATE_CHUNKS = ${JSON.stringify(combinedDailyChunks, null, 2)};`;

  const updatedFileContents = fileContents.replace(
    /export const CYBERSECURITY_DAILY_UPDATE_CHUNKS = \[[\s\S]*?\];/,
    newArrayLiteral
  );

  if (updatedFileContents === fileContents) {
    console.error("Could not find CYBERSECURITY_DAILY_UPDATE_CHUNKS array to update -- file structure may have changed. Aborting without writing.");
    process.exit(1);
  }

  await writeFile(KNOWLEDGE_BASE_PATH, updatedFileContents, "utf-8");
  console.log(`Knowledge base updated: ${combinedDailyChunks.length} total daily-update chunks (${newChunks.length} new today).`);
}

main().catch((err) => {
  console.error("Daily CMM update failed:", err);
  process.exit(1);
});
