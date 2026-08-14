// cybersecurityModel.js
//
// The real Cybersecurity and Capacity Building model: a lightweight RAG
// (retrieval-augmented generation) pipeline over CYBERSECURITY_KNOWLEDGE_CHUNKS
// (see cybersecurityKnowledgeBase.js). Rather than stuffing the entire
// knowledge base into every system prompt (wasteful, and dilutes what
// actually matters for THIS question), each user message is embedded
// and compared against the knowledge base by real cosine similarity --
// only the most relevant chunks are pulled in for that specific turn.
// Same underlying technique used by production RAG systems, scaled down
// appropriately for a knowledge base of this size (a few dozen chunks,
// not millions) -- no separate vector database needed, an in-memory
// array with cosine similarity is genuinely sufficient here and avoids
// a real infrastructure/cost dependency.
//
// Uses the same OPENAI_API_KEY already configured for chat completions
// elsewhere in this backend -- no new environment variable needed.
// text-embedding-3-small is OpenAI's current small/cheap embedding
// model, well suited to a knowledge base this size.

import OpenAI from "openai";
import { CYBERSECURITY_KNOWLEDGE_CHUNKS } from "./cybersecurityKnowledgeBase.js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const EMBEDDING_MODEL = "text-embedding-3-small";

// In-memory cache: { id, title, text, embedding }[] -- computed ONCE
// (lazily, on first real use) rather than on every single request,
// since the knowledge base's content doesn't change between requests.
// A real production system with a much larger or frequently-changing
// knowledge base would persist this to disk/a database instead of
// memory; for a knowledge base this size, recomputing once per server
// restart is a reasonable, simple tradeoff.
let embeddedChunksCache = null;
let embeddingInProgress = null;

async function embedText(text) {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
  });
  return response.data[0].embedding;
}

function cosineSimilarity(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Embeds every knowledge chunk once, caching the result for the
// lifetime of the server process. Concurrent callers (multiple people
// asking cybersecurity questions at once, right as the server starts)
// share the SAME in-flight embedding request rather than each kicking
// off their own redundant, costly batch -- embeddingInProgress holds
// that shared promise.
async function ensureKnowledgeBaseEmbedded() {
  if (embeddedChunksCache) return embeddedChunksCache;
  if (embeddingInProgress) return embeddingInProgress;

  embeddingInProgress = (async () => {
    const embedded = await Promise.all(
      CYBERSECURITY_KNOWLEDGE_CHUNKS.map(async (chunk) => ({
        ...chunk,
        embedding: await embedText(`${chunk.title}\n\n${chunk.text}`),
      }))
    );
    embeddedChunksCache = embedded;
    embeddingInProgress = null;
    return embedded;
  })();

  return embeddingInProgress;
}

// Returns the top-K most relevant knowledge chunks for a given user
// question, by real cosine similarity between the question's embedding
// and each chunk's embedding -- not keyword matching, genuine semantic
// retrieval.
export async function retrieveCybersecurityKnowledge(userMessage, topK = 4) {
  if (!userMessage || typeof userMessage !== "string" || !userMessage.trim()) {
    return [];
  }

  const chunks = await ensureKnowledgeBaseEmbedded();
  const queryEmbedding = await embedText(userMessage);

  const scored = chunks.map((chunk) => ({
    ...chunk,
    score: cosineSimilarity(queryEmbedding, chunk.embedding),
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

// Builds the actual grounding text folded into the system prompt for
// this turn -- only the retrieved chunks, not the whole knowledge base.
export function formatRetrievedKnowledge(retrievedChunks) {
  if (!retrievedChunks || retrievedChunks.length === 0) return "";
  return retrievedChunks
    .map((chunk) => `[${chunk.title}]\n${chunk.text}`)
    .join("\n\n");
}

// The real 23 Factors across the 5 Dimensions, for the Structured Form
// assessment flow (see /cmm-assessment-report below and the frontend
// form UI) -- one question per Factor, grouped by Dimension into 5
// form steps. knowledgeChunkId maps each Factor to its real indicator
// chunk in cybersecurityKnowledgeBase.js, so the report-generation
// endpoint can pull in the EXACT real CMM criteria for that Factor
// (not the whole knowledge base) when scoring the person's answer.
export const CMM_ASSESSMENT_FACTORS = [
  { id: "D1.1", dimension: "Dimension 1: Cybersecurity Policy and Strategy", name: "National Cybersecurity Strategy", question: "Does a national cybersecurity strategy exist? Describe its current state -- is it published, who was consulted in developing it, and how is it implemented/reviewed?", knowledgeChunkId: "cmm-d1.1-indicators" },
  { id: "D1.2", dimension: "Dimension 1: Cybersecurity Policy and Strategy", name: "Incident Response and Crisis Management", question: "Describe your national capacity to identify, categorise, and respond to cybersecurity incidents, and whether cybersecurity is integrated into national crisis management.", knowledgeChunkId: "cmm-d1.2-indicators" },
  { id: "D1.3", dimension: "Dimension 1: Cybersecurity Policy and Strategy", name: "Critical Infrastructure (CI) Protection", question: "Describe how critical infrastructure assets are identified, regulated for cybersecurity, and how CI operators practice cybersecurity.", knowledgeChunkId: "cmm-d1.3-indicators" },
  { id: "D1.4", dimension: "Dimension 1: Cybersecurity Policy and Strategy", name: "Cybersecurity in Defence and National Security", question: "Describe your defence/national security establishment's cybersecurity strategy, capability, and coordination with civil authorities.", knowledgeChunkId: "cmm-d1.4-indicators" },
  { id: "D2.1", dimension: "Dimension 2: Cybersecurity Culture and Society", name: "Cybersecurity Mindset", question: "Describe the general awareness and prioritisation of cybersecurity risk across government, private sector, and the public.", knowledgeChunkId: "cmm-d2.1-2.2-indicators" },
  { id: "D2.2", dimension: "Dimension 2: Cybersecurity Culture and Society", name: "Trust and Confidence in Online Services", question: "Describe public trust and digital literacy regarding online services, e-government, e-commerce, and disinformation.", knowledgeChunkId: "cmm-d2.1-2.2-indicators" },
  { id: "D2.3", dimension: "Dimension 2: Cybersecurity Culture and Society", name: "User Understanding of Personal Information Protection Online", question: "Describe how well users understand and can protect their personal information online, and what privacy policies exist.", knowledgeChunkId: "cmm-d2.3-2.4-2.5-indicators" },
  { id: "D2.4", dimension: "Dimension 2: Cybersecurity Culture and Society", name: "Reporting Mechanisms", question: "Describe the channels available for the public to report cybercrime (fraud, cyber-bullying, breaches, etc.) and how well they're used.", knowledgeChunkId: "cmm-d2.3-2.4-2.5-indicators" },
  { id: "D2.5", dimension: "Dimension 2: Cybersecurity Culture and Society", name: "Media and Online Platforms", question: "Describe how much mainstream and social media discuss cybersecurity, and how whistleblowers are treated.", knowledgeChunkId: "cmm-d2.3-2.4-2.5-indicators" },
  { id: "D3.1", dimension: "Dimension 3: Building Cybersecurity Knowledge and Capabilities", name: "Building Cybersecurity Awareness", question: "Describe existing cybersecurity awareness-raising programmes from government, private sector, and civil society, including executive awareness.", knowledgeChunkId: "cmm-d3.1-3.2-indicators" },
  { id: "D3.2", dimension: "Dimension 3: Building Cybersecurity Knowledge and Capabilities", name: "Cybersecurity Education", question: "Describe the availability of cybersecurity education (schools, universities, qualified educators) and how it's administered/funded.", knowledgeChunkId: "cmm-d3.1-3.2-indicators" },
  { id: "D3.3", dimension: "Dimension 3: Building Cybersecurity Knowledge and Capabilities", name: "Cybersecurity Professional Training", question: "Describe the availability and uptake of professional cybersecurity training and certification programmes.", knowledgeChunkId: "cmm-d3.3-3.4-indicators" },
  { id: "D3.4", dimension: "Dimension 3: Building Cybersecurity Knowledge and Capabilities", name: "Cybersecurity Research and Innovation", question: "Describe the state of cybersecurity research and innovation activity, funding, and international collaboration.", knowledgeChunkId: "cmm-d3.3-3.4-indicators" },
  { id: "D4.1", dimension: "Dimension 4: Legal and Regulatory Frameworks", name: "Legal and Regulatory Provisions", question: "Describe existing substantive and procedural cybercrime legislation, cybersecurity regulatory requirements, and human rights impact assessment practice.", knowledgeChunkId: "cmm-d4.1-indicators" },
  { id: "D4.2", dimension: "Dimension 4: Legal and Regulatory Frameworks", name: "Related Legislative Frameworks", question: "Describe the state of data protection, child protection online, consumer protection, and intellectual property legislation.", knowledgeChunkId: "cmm-d4.2-indicators" },
  { id: "D4.3", dimension: "Dimension 4: Legal and Regulatory Frameworks", name: "Legal and Regulatory Capability and Capacity", question: "Describe the capacity of law enforcement, prosecutors, courts, and regulatory bodies to handle cybercrime and electronic evidence.", knowledgeChunkId: "cmm-d4.3-indicators" },
  { id: "D4.4", dimension: "Dimension 4: Legal and Regulatory Frameworks", name: "Formal and Informal Co-operation Frameworks to Combat Cybercrime", question: "Describe cooperation between law enforcement and the private sector, foreign counterparts, and government/criminal justice actors on cybercrime.", knowledgeChunkId: "cmm-d4.4-indicators" },
  { id: "D5.1", dimension: "Dimension 5: Standards and Technologies", name: "Adherence to Standards", question: "Describe the adoption of cybersecurity standards in ICT security, procurement, and product/service provision.", knowledgeChunkId: "cmm-d5.1-5.2-indicators" },
  { id: "D5.2", dimension: "Dimension 5: Standards and Technologies", name: "Security Controls", question: "Describe the deployment of technological security controls (patching, backups) and cryptographic controls across sectors.", knowledgeChunkId: "cmm-d5.1-5.2-indicators" },
  { id: "D5.3", dimension: "Dimension 5: Standards and Technologies", name: "Software Quality", question: "Describe software quality assurance practices and update/patch management policies in public and private sectors.", knowledgeChunkId: "cmm-d5.3-5.4-indicators" },
  { id: "D5.4", dimension: "Dimension 5: Standards and Technologies", name: "Communications and Internet Infrastructure Resilience", question: "Describe the reliability of Internet infrastructure and the existence of monitoring/incident-response mechanisms for it.", knowledgeChunkId: "cmm-d5.3-5.4-indicators" },
  { id: "D5.5", dimension: "Dimension 5: Standards and Technologies", name: "Cybersecurity Marketplace", question: "Describe the domestic cybersecurity technology/services marketplace, outsourcing risk practices, and cyber insurance availability.", knowledgeChunkId: "cmm-d5.5-5.6-indicators" },
  { id: "D5.6", dimension: "Dimension 5: Standards and Technologies", name: "Responsible Disclosure", question: "Describe how vulnerability information is shared and whether a responsible-disclosure policy/legal protection framework exists.", knowledgeChunkId: "cmm-d5.5-5.6-indicators" },
];

export function getFactorKnowledgeChunk(knowledgeChunkId) {
  return CYBERSECURITY_KNOWLEDGE_CHUNKS.find((c) => c.id === knowledgeChunkId) || null;
}

// Generates the real Structured Form assessment report -- takes the
// person's actual answers for each of the 23 Factors, grounds each one
// in its real CMM stage criteria (via getFactorKnowledgeChunk, not the
// whole knowledge base), and asks the model to produce a genuine
// per-Factor maturity estimate with rationale and concrete capacity-
// building recommendations. Uses gpt-4o-mini (same cost-conscious
// model already used elsewhere in this backend for similar generation
// tasks, e.g. live-chat image analysis).
export async function buildCmmAssessmentReport(openaiClient, answers) {
  const sections = answers
    .map((a) => {
      const factor = CMM_ASSESSMENT_FACTORS.find((f) => f.id === a.factorId);
      if (!factor) return null;
      const knowledge = getFactorKnowledgeChunk(factor.knowledgeChunkId);
      return (
        `### ${factor.id} ${factor.name} (${factor.dimension})\n` +
        `Real CMM stage criteria for this Factor:\n${knowledge ? knowledge.text : "(criteria not found)"}\n\n` +
        `The person's actual answer:\n${(a.answer || "").trim() || "(left blank)"}`
      );
    })
    .filter(Boolean)
    .join("\n\n---\n\n");

  const response = await openaiClient.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "You are generating a real Cybersecurity Capacity Maturity Model (CMM) self-assessment report, grounded in the Global Cyber Security Capacity Centre's actual CMM framework. For each Factor below, you're given its REAL stage criteria (start-up/formative/established/strategic/dynamic) and the person's own real answer describing their situation. For each Factor, write: (1) your best-estimate maturity Stage based on their answer, (2) a brief rationale explaining why, referencing the actual criteria, (3) 1-2 concrete, specific capacity-building recommendations for the next stage up. If an answer was left blank or too vague to assess, say so honestly rather than guessing a stage. Organize the report by the 5 Dimensions, with a short executive summary at the top (overall strengths, overall gaps, top 3 priority recommendations across all Dimensions). Write in clear plain prose with minimal markdown -- this will be shown as a real chat message, not a formatted document. Be honest that this is a self-assessment from conversational answers, not a formal multi-stakeholder CMM review, and that a full review would involve broader stakeholder consultation.",
      },
      { role: "user", content: sections },
    ],
    max_tokens: 3000,
  });

  return response.choices?.[0]?.message?.content?.trim() || "";
}


// separate from GARNET's general chat prompt, grounded specifically in
// the real GCSCC Cybersecurity Capacity Maturity Model (CMM) and real,
// current GCSCC context (the Global Constellation, and GCSCC's own 2025
// expansion into AI-era cybersecurity work), per explicit request to
// build a model that helps users perform cybersecurity tasks and
// national capacity building while considering the AI era.
export function buildCybersecurityModelInstructions(retrievedKnowledgeText) {
  return (
    "You are GARNET's Cybersecurity and Capacity Building model, a specialized assistant grounded in the Global Cyber Security Capacity Centre's (GCSCC, University of Oxford) real Cybersecurity Capacity Maturity Model for Nations (CMM) and the GCSCC's Global Constellation of regional capacity-building centres. " +
    "Your purpose is to help users -- policymakers, national cybersecurity teams, researchers, or anyone doing cybersecurity capacity-building work -- understand and apply the CMM's five Dimensions (Policy and Strategy; Culture and Society; Building Knowledge and Capabilities; Legal and Regulatory Frameworks; Standards and Technologies), assess where a nation or organisation stands using the CMM's five Stages of maturity (start-up, formative, established, strategic, dynamic), and think through practical next steps for improving capacity. " +
    "AI ERA: cybersecurity capacity building is increasingly shaped by AI -- both AI-enabled threats (automated attacks, AI-generated disinformation and social engineering, adversarial manipulation of AI systems) and AI as a capacity-building tool (AI-assisted defence, AI literacy as part of workforce development, and AI risk as a new consideration within national strategy). The GCSCC itself has real, current work in this area (expanded collaboration with Monash University on AI and cybersecurity, an AI Cybersecurity Conference, and work with the Mexican government on AI cybersecurity readiness) -- bring this AI-era lens into your answers naturally where it's genuinely relevant, not as a forced addition to every response. " +
    (retrievedKnowledgeText
      ? `REAL CMM/GCSCC CONTEXT RETRIEVED FOR THIS QUESTION (use this as your actual grounding -- these are real facts from the CMM 2021 Edition and current GCSCC information, including the real stage-by-stage indicator criteria, not something to second-guess or hedge about):\n\n${retrievedKnowledgeText}\n\n`
      : "") +
    "Answer using the real context above when it's relevant to what's being asked. If a question goes genuinely beyond what's retrieved here, say so honestly and offer to help with what you do have, or suggest they consult the full CMM document directly at https://gcscc.ox.ac.uk/the-cmm. Never fabricate specific CMM indicator details you don't actually have. " +
    "GUIDED ASSESSMENT PROJECTS: the user can start a guided capacity-assessment project (via the 'Start Assessment Project' option in this mode), choosing either a structured form (handled separately by a dedicated report-generation flow -- if this happens, you'll see the results as a system message with the person's real answers already collected) or a GUIDED CONVERSATION, which you run directly: if the user's message indicates they want to start a guided conversational assessment, walk through the CMM's 5 Dimensions ONE AT A TIME, and within each Dimension its real Factors one at a time -- ask a genuine, specific self-assessment question about their organisation's/nation's current situation for that Factor (grounded in the real stage criteria above), let them answer in their own words, then move to the next Factor. Keep track of where you are in the conversation (which Dimension/Factor you've covered) using the conversation history itself -- don't restart from Dimension 1 if you're clearly partway through. Once all 5 Dimensions have been covered, synthesize a real structured report: for each Factor, your best-estimate maturity Stage based on what they described (being honest that this is an estimate from a conversation, not a formal multi-stakeholder CMM review), a brief rationale referencing the real CMM criteria, and 1-2 concrete, specific capacity-building recommendations. Never rush through multiple Dimensions in one message -- this should feel like a genuine guided process, not a wall of questions dumped at once. " +
    "You still have access to real-time web search -- use it for anything current-events-related (recent breaches, new national strategies, recent GCSCC news) that wouldn't be in a static knowledge base. " +
    "Keep the same clear, direct GARNET voice as the rest of the app -- no unnecessary hedging, no markdown headers in casual replies, genuinely useful and specific rather than generic cybersecurity platitudes."
  );
}
