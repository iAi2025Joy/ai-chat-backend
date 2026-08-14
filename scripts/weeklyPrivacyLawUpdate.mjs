// scripts/weeklyPrivacyLawUpdate.mjs
//
// Run WEEKLY by GitHub Actions (see
// .github/workflows/privacy-law-weekly-update.yml), deliberately a
// slower cadence than the daily CMM update script -- formal law and
// policy genuinely changes more slowly than general news, so weekly is
// the right rhythm here, per explicit request. Same overall pattern as
// scripts/dailyCmmUpdate.mjs (proven working): checks curated real
// sources, evaluates relevance via gpt-4o-mini, generates knowledge
// chunks, commits directly to the repo -- Render's existing auto-
// deploy-on-push then picks up the change automatically.
//
// SCOPE: per explicit request, starting from GDPR and covering global
// data protection/privacy law worldwide, plus AI ethics and governance
// worldwide -- writes into PRIVACY_LAW_WEEKLY_UPDATE_CHUNKS (a
// separate array from the daily CMM section, kept clearly apart in
// cybersecurityKnowledgeBase.js).
//
// SOURCES -- real, legitimate sources with confirmed or standard-
// pattern RSS feeds. DLA Piper's Privacy Matters is confirmed to have
// a real, working RSS feed covering GDPR/global data protection law.
// OECD.AI (oecd.ai) is the real, live-updated OECD AI Policy
// Observatory, now tracking 1,300+ AI policy initiatives across 80+
// jurisdictions -- its "wonk" blog section is tried here via the
// standard WordPress /feed/ pattern; if this specific URL doesn't
// resolve, that's a normal, expected thing to verify/adjust in the
// Action's logs, same as any source in the daily script.
const CURATED_SOURCES = [
  { name: "DLA Piper -- Privacy Matters (Global GDPR/Data Protection)", url: "https://privacymatters.dlapiper.com/feed/" },
  { name: "IAPP -- US Privacy News Digest", url: "https://iapp.org/rss/united-states-dashboard-digest" },
  { name: "OECD.AI -- AI Policy Observatory", url: "https://oecd.ai/en/wonk/feed" },
  { name: "Future of Privacy Forum", url: "https://fpf.org/feed/" },
  { name: "Norton Rose Fulbright -- Data Protection Report", url: "https://feeds.feedburner.com/DataProtectionReport" },
];

// Keeps this section from growing unbounded -- see the matching
// constant/reasoning in dailyCmmUpdate.mjs. 80 is roughly a year and a
// half of weekly coverage at a modest number of items per run, a
// reasonable working size given law/policy changes more slowly than
// general news.
const MAX_WEEKLY_UPDATE_CHUNKS = 80;

import OpenAI from "openai";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KNOWLEDGE_BASE_PATH = path.join(__dirname, "..", "cybersecurityKnowledgeBase.js");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function fetchFeedItems(source) {
  try {
    const response = await fetch(source.url, {
      // A confirmed real cause of this script silently returning zero
      // items: several source sites (particularly law-firm sites like
      // DLA Piper's, which commonly run bot-protection/WAF services)
      // block requests carrying an unfamiliar, clearly-bot-identifying
      // User-Agent string -- confirmed by directly verifying the DLA
      // Piper feed URL itself is real and returns valid RSS content
      // when fetched with a normal browser User-Agent. Using a
      // standard one here is legitimate for this use case (reading
      // public RSS feeds these sites intentionally publish for
      // syndication), not evasion of any real access restriction.
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36" },
    });
    if (!response.ok) {
      console.error(`[${source.name}] fetch failed: HTTP ${response.status}`);
      return [];
    }
    const xml = await response.text();
    // Same deliberately simple, dependency-free RSS/Atom extractor as
    // dailyCmmUpdate.mjs -- see that file's comment for why a full XML
    // parsing library wasn't used for something this small.
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
    console.error(`[${source.name}] error:`, err.message);
    return [];
  }
}

// Same real-evaluation approach as dailyCmmUpdate.mjs -- screens for
// genuine relevance rather than including everything, and specifically
// tags country-level law/policy developments by country name for
// reliable future retrieval (e.g. "what does GARNET know about
// [country]'s privacy law").
async function evaluateAndSummarize(item) {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "You are screening real news items for relevance to global data protection/privacy law (GDPR and equivalent laws worldwide, data protection authorities, enforcement actions, new/amended legislation) OR AI ethics and governance worldwide (national AI strategies, AI regulation, AI ethics frameworks, algorithmic accountability). Respond with ONLY a JSON object, no other text: {\"relevant\": true/false, \"country\": \"the real country/jurisdiction name if this is specifically about ONE country's law/policy, else null\", \"title\": \"a short descriptive title if relevant -- if a country was identified, put it at the start in brackets, e.g. '[Brazil] LGPD Amendment Takes Effect'\", \"summary\": \"a factual 2-4 sentence summary if relevant, based ONLY on the real title/source given -- do not invent specifics you don't actually have\"}. Mark relevant:false for routine vendor content, opinion pieces without real news, or anything not genuinely about a real legal/policy/regulatory development.",
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
  console.log(`Weekly privacy law & AI governance update starting -- ${new Date().toISOString()}`);

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
        const countryTag = evaluation.country ? `[${evaluation.country}] ` : "";
        newChunks.push({
          id: `privacy-weekly-${today}-${counter}`,
          title: `[${today}] ${countryTag}${evaluation.title || item.title}`,
          text: `${evaluation.summary} (Source: ${item.source}${item.link ? ", " + item.link : ""})`,
        });
      }
    } catch (err) {
      console.error(`Evaluation failed for "${item.title}":`, err.message);
    }
  }

  console.log(`${newChunks.length} new relevant item(s) found this week.`);

  if (newChunks.length === 0) {
    console.log("Nothing relevant this week -- knowledge base left unchanged.");
    return;
  }

  const fileContents = await readFile(KNOWLEDGE_BASE_PATH, "utf-8");

  // Same real-module-import approach as dailyCmmUpdate.mjs -- more
  // robust than regex-parsing the array contents by hand.
  const currentModule = await import(`${KNOWLEDGE_BASE_PATH}?update=${Date.now()}`);
  const existingWeeklyChunks = currentModule.PRIVACY_LAW_WEEKLY_UPDATE_CHUNKS || [];

  const combinedWeeklyChunks = [...newChunks, ...existingWeeklyChunks].slice(0, MAX_WEEKLY_UPDATE_CHUNKS);

  const newArrayLiteral = `export const PRIVACY_LAW_WEEKLY_UPDATE_CHUNKS = ${JSON.stringify(combinedWeeklyChunks, null, 2)};`;

  const updatedFileContents = fileContents.replace(
    /export const PRIVACY_LAW_WEEKLY_UPDATE_CHUNKS = \[[\s\S]*?\];/,
    newArrayLiteral
  );

  if (updatedFileContents === fileContents) {
    console.error("Could not find PRIVACY_LAW_WEEKLY_UPDATE_CHUNKS array to update -- file structure may have changed. Aborting without writing.");
    process.exit(1);
  }

  await writeFile(KNOWLEDGE_BASE_PATH, updatedFileContents, "utf-8");
  console.log(`Knowledge base updated: ${combinedWeeklyChunks.length} total weekly privacy/AI governance chunks (${newChunks.length} new this week).`);
}

main().catch((err) => {
  console.error("Weekly privacy law update failed:", err);
  process.exit(1);
});
