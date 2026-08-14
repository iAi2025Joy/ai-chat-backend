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
// building recommendations. Returns REAL STRUCTURED DATA (not prose)
// -- per explicit request to generate a downloadable Word document
// with real charts, the report needs a genuine numeric stageNumber
// per Factor (to compute a real per-Dimension average for the chart)
// and a real hierarchical structure (to build actual Word headings/
// tables), not just a block of text. Uses gpt-4o-mini (same
// cost-conscious model already used elsewhere in this backend for
// similar generation tasks, e.g. live-chat image analysis).
export async function buildCmmAssessmentReport(openaiClient, answers, projectName = null) {
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
          "You are generating a real Cybersecurity Capacity Maturity Model (CMM) self-assessment report, grounded in the Global Cyber Security Capacity Centre's actual CMM framework. For each Factor below, you're given its REAL stage criteria (start-up/formative/established/strategic/dynamic) and the person's own real answer describing their situation. " +
          (projectName ? `The project is called "${projectName}". ` : "") +
          "Respond with ONLY a JSON object, no other text, matching this EXACT shape: " +
          `{"executiveSummary": "2-4 sentences on overall strengths and gaps", "topPriorityRecommendations": ["...", "...", "..."], "dimensions": [{"name": "Dimension 1: Cybersecurity Policy and Strategy", "factors": [{"id": "D1.1", "name": "National Cybersecurity Strategy", "stage": "Formative", "stageNumber": 2, "rationale": "...", "recommendation": "..."}]}]}. ` +
          "stageNumber must be an integer 1-5 matching stage exactly: 1=Start-up, 2=Formative, 3=Established, 4=Strategic, 5=Dynamic. If an answer was left blank or too vague to assess, still include the Factor with stage 'Unable to assess', stageNumber 0, and say so honestly in the rationale rather than guessing. Group factors under their real Dimension name, in the same 5-Dimension order as given. topPriorityRecommendations should have exactly 3 items, the most impactful across all Dimensions. Be honest in rationale text that this is a self-assessment from answers, not a formal multi-stakeholder CMM review.",
      },
      { role: "user", content: sections },
    ],
    response_format: { type: "json_object" },
    max_tokens: 4000,
  });

  const raw = response.choices?.[0]?.message?.content || "{}";
  try {
    const parsed = JSON.parse(raw);
    return {
      ...parsed,
      frameworkSource: "GCSCC Cybersecurity Capacity Maturity Model (CMM)",
      level: "country",
      domain: "cybersecurity",
      projectName,
    };
  } catch (err) {
    console.error("CMM report JSON parse failed:", err.message, "raw:", raw.slice(0, 500));
    return null;
  }
}

// Human-readable name for each Stage, given a stageNumber (0 for
// unassessed, 1-5 for the real CMM stages) -- shared by the chat
// summary renderer and the Word document builder so they can't drift
// out of sync with each other.
const STAGE_NAMES = ["Unable to assess", "Start-up", "Formative", "Established", "Strategic", "Dynamic"];

// Renders the structured report as real markdown for display in the
// chat -- run through the SAME formatMarkdownToHTML() every other bot
// message uses (see server.js), so this looks and behaves exactly like
// any other reply, not a special case.
export function renderCmmReportMarkdown(report) {
  if (!report) return "Could not generate the assessment report.";
  const titleDomain = report.domain === "privacy" ? "Privacy" : "Cybersecurity";
  const titleLevel = report.level === "company" ? "Organization" : "National";
  const heading = report.frameworkSource
    ? `## ${titleLevel} ${titleDomain} Maturity Assessment${report.projectName ? ` -- ${report.projectName}` : ""}\n### Prepared by Institute of AI Cybersecurity Services\n\n`
    : `## Cybersecurity Capacity Assessment -- Prepared by Institute of AI Cybersecurity Services\n\n`;
  let md = heading;
  md += `${report.executiveSummary || ""}\n\n`;
  if (Array.isArray(report.topPriorityRecommendations) && report.topPriorityRecommendations.length > 0) {
    md += `**Top priority recommendations:**\n`;
    report.topPriorityRecommendations.forEach((rec) => {
      md += `- ${rec}\n`;
    });
    md += `\n`;
  }
  (report.dimensions || []).forEach((dim) => {
    md += `### ${dim.name}\n\n`;
    (dim.factors || []).forEach((f) => {
      md += `**${f.id} ${f.name} -- ${f.stage}**\n${f.rationale}\n*Recommendation:* ${f.recommendation}\n\n`;
    });
  });
  md += report.frameworkSource
    ? `\n_This is a self-assessment based on the answers provided, grounded in the real ${report.frameworkSource}, not a formal independent audit._`
    : `\n_This is a self-assessment based on the answers provided, not a formal multi-stakeholder CMM review. A full GCSCC review would involve broader in-country stakeholder consultation._`;
  return md;
}

// Builds the actual downloadable .docx file -- real headings, a real
// table per Dimension (Factor / Stage / Rationale / Recommendation),
// and the real chart image (rendered client-side via the app's own
// already-working Chart.js setup and passed in here as a base64 PNG --
// deliberately NOT rendered server-side, since native canvas/chart
// libraries are a common source of unreliable deploys on hosting
// platforms like Render that don't include their system-level
// dependencies by default; doing the actual pixel rendering in the
// browser, where Chart.js is already proven working, avoids that risk
// entirely). Uses the docx library -- pure JS, no native dependencies.
// Genuinely framework-agnostic since the STAGE_NAMES fix above -- used
// for all 4 assessment types (CMM, NIST CSF, NIST Privacy Framework,
// and the country-privacy synthesis), not just CMM.
export async function buildCmmReportDocx(report, chartImageBase64) {
  const {
    Document,
    Packer,
    Paragraph,
    HeadingLevel,
    Table,
    TableRow,
    TableCell,
    TextRun,
    ImageRun,
    WidthType,
    AlignmentType,
  } = await import("docx");

  const titleDomain = report.domain === "privacy" ? "Privacy" : "Cybersecurity";
  const titleLevel = report.level === "company" ? "Organization" : "National";
  const docTitle = report.frameworkSource
    ? `${titleLevel} ${titleDomain} Maturity Assessment${report.projectName ? ` -- ${report.projectName}` : ""}`
    : "Cybersecurity Capacity Assessment Report";

  const children = [
    new Paragraph({
      text: docTitle,
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: "Prepared by Institute of AI Cybersecurity Services", italics: true, size: 24 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: `Generated ${new Date().toISOString().slice(0, 10)}`, size: 20, color: "888888" })],
    }),
    new Paragraph({ text: "", spacing: { after: 200 } }),
    new Paragraph({ text: "Executive Summary", heading: HeadingLevel.HEADING_1 }),
    new Paragraph({ text: report.executiveSummary || "" }),
  ];

  if (Array.isArray(report.topPriorityRecommendations) && report.topPriorityRecommendations.length > 0) {
    children.push(new Paragraph({ text: "Top Priority Recommendations", heading: HeadingLevel.HEADING_1 }));
    report.topPriorityRecommendations.forEach((rec) => {
      children.push(new Paragraph({ text: rec, bullet: { level: 0 } }));
    });
  }

  // The real chart image -- a genuine drawing/chart per explicit
  // request, not decorative filler: a bar chart of each Dimension's
  // average real maturity-stage number (1-5), computed from the same
  // structured data used everywhere else in this report, so the chart
  // and the written content can never disagree with each other.
  if (chartImageBase64) {
    try {
      const base64Data = chartImageBase64.replace(/^data:image\/\w+;base64,/, "");
      const imageBuffer = Buffer.from(base64Data, "base64");
      children.push(new Paragraph({ text: "Maturity Overview by Dimension", heading: HeadingLevel.HEADING_1 }));
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new ImageRun({ data: imageBuffer, transformation: { width: 500, height: 300 } })],
        })
      );
    } catch (err) {
      console.error("Could not embed chart image in report:", err.message);
      // Falls through without the chart image rather than failing the
      // whole document -- the written content is still a complete,
      // real report even without it.
    }
  }

  (report.dimensions || []).forEach((dim) => {
    children.push(new Paragraph({ text: dim.name, heading: HeadingLevel.HEADING_1 }));

    const headerRow = new TableRow({
      children: ["Factor", "Stage", "Rationale", "Recommendation"].map(
        (label) =>
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: label, bold: true })] })],
          })
      ),
    });

    const dataRows = (dim.factors || []).map((f) => {
      const stageLabel = f.stage || STAGE_NAMES[f.stageNumber] || "-";
      return new TableRow({
        children: [
          new Paragraph({ children: [new TextRun({ text: `${f.id} ${f.name}`, bold: true })] }),
          new Paragraph({ text: stageLabel }),
          new Paragraph({ text: f.rationale || "" }),
          new Paragraph({ text: f.recommendation || "" }),
        ].map((p) => new TableCell({ children: [p] })),
      });
    });

    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [headerRow, ...dataRows],
      })
    );
    children.push(new Paragraph({ text: "", spacing: { after: 200 } }));
  });

  children.push(
    new Paragraph({
      text: "This is a self-assessment based on the answers provided, not a formal multi-stakeholder CMM review conducted by the GCSCC. A full review involves broader in-country stakeholder consultation and desk research.",
      italics: true,
    })
  );

  const doc = new Document({
    sections: [{ children }],
  });

  return Packer.toBuffer(doc);
}


// The Cybersecurity and Capacity Building model's own system prompt --
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
    "OTHER REAL FRAMEWORKS YOU ALSO COVER (per explicit request, assessments can be at Country or Company/Organization level, and for Cybersecurity or Privacy -- the retrieved context above is CMM-specific, so use this instead when a Guided Conversation is at the company/organization level or is about Privacy): " +
    "For COMPANY/ORGANIZATION-level Cybersecurity, ground your questions and assessment in the real NIST Cybersecurity Framework (CSF): 5 Functions -- Identify (asset/risk understanding), Protect (safeguards: access control, training, data security), Detect (monitoring, anomaly detection), Respond (incident response planning), Recover (resilience, backup/recovery, business continuity) -- assessed against 4 real Implementation Tiers: Partial (ad hoc, reactive), Risk Informed (approved by management but not org-wide policy), Repeatable (formally established policy, regularly updated), Adaptive (continuously improves based on lessons learned and predictive indicators). " +
    "For COMPANY/ORGANIZATION-level Privacy, ground your questions in the real NIST Privacy Framework: 5 Functions -- Identify-P (inventory what personal data is processed and why), Govern-P (privacy governance, policies, accountable roles, legal awareness), Control-P (individuals' real ability to access/correct/delete their data), Communicate-P (transparency of data practices to individuals), Protect-P (technical/organizational safeguards for personal data) -- using the SAME 4-tier scale as NIST CSF above (Partial/Risk Informed/Repeatable/Adaptive). " +
    "For COUNTRY-level Privacy, no single official 'national privacy maturity model' exists the way GCSCC's CMM exists for cybersecurity -- ground your questions honestly in real international reference points instead: the OECD Privacy Guidelines' principles (comprehensive legislation reflecting Collection Limitation/Purpose Specification/Use Limitation/Security Safeguards/Openness/Individual Participation/Accountability), whether an empowered independent enforcement authority (a Data Protection Authority) exists, real exercisable individual rights and breach notification requirements, and international engagement (e.g. Council of Europe Convention 108+ accession, clear cross-border data transfer rules) -- assessed against the same 4-tier scale for consistency (Partial/Risk Informed/Repeatable/Adaptive). Be upfront that this is a synthesis of real international frameworks, not a single official named model, when it's relevant to mention. " +
    (retrievedKnowledgeText
      ? `REAL CMM/GCSCC CONTEXT RETRIEVED FOR THIS QUESTION (use this as your actual grounding -- these are real facts from the CMM 2021 Edition and current GCSCC information, including the real stage-by-stage indicator criteria, not something to second-guess or hedge about):\n\n${retrievedKnowledgeText}\n\n`
      : "") +
    "Answer using the real context above when it's relevant to what's being asked. If a question goes genuinely beyond what's retrieved here, say so honestly and offer to help with what you do have, or suggest they consult the full CMM document directly at https://gcscc.ox.ac.uk/the-cmm. Never fabricate specific CMM indicator details you don't actually have. " +
    "All assessments and reports you produce in this mode are prepared under Institute of AI Cybersecurity Services -- mention this naturally when introducing a report or the assessment process (e.g. 'This assessment is prepared by Institute of AI Cybersecurity Services'), not on every single message. " +
    "GUIDED ASSESSMENT PROJECTS: the user can start a guided capacity-assessment project (via the 'Start Assessment Project' option in this mode), choosing either a structured form (handled separately by a dedicated report-generation flow -- if this happens, you'll see the results as a system message with the person's real answers already collected) or a GUIDED CONVERSATION, which you run directly. Their kickoff message tells you the level (country or company/organization), domain (cybersecurity or privacy), the real country/company name, and the project name -- use all of this. Walk through the right real framework for that level+domain combination ONE AREA AT A TIME (see the framework details above/below): the CMM's 5 Dimensions and their real Factors for country+cybersecurity, or the 5 real Functions for the other 3 combinations (NIST CSF, NIST Privacy Framework, or the country-privacy synthesis) -- ask a genuine, specific self-assessment question about their real situation for each one (grounded in the real criteria), let them answer in their own words, then move to the next. Keep track of where you are in the conversation using the conversation history itself -- don't restart from the beginning if you're clearly partway through. Never rush through multiple areas in one message -- this should feel like a genuine guided process, not a wall of questions dumped at once. " +
    "FINISHING A GUIDED CONVERSATION -- READ THIS CAREFULLY: once the assessment is genuinely complete (all relevant areas for the chosen level/domain have been covered), write your normal prose summary of the findings (strengths, gaps, top recommendations) AND, immediately after it, include a fenced code block starting with ```cmm-report and ending with ``` containing ONLY a single valid JSON object with this EXACT shape (no other text inside the fence): " +
    `{"level": "country or company", "domain": "cybersecurity or privacy", "entityName": "the real country or company name they told you", "projectName": "the real project name they told you", "frameworkSource": "the real framework name", "executiveSummary": "2-4 sentences", "topPriorityRecommendations": ["...", "...", "..."], "dimensions": [{"name": "the real Dimension name for CMM, or just the framework's own name as a single group for the other 3 frameworks", "factors": [{"id": "...", "name": "...", "stage": "...", "stageNumber": 1-5 or 1-4 matching the real scale used, "rationale": "...", "recommendation": "..."}]}]}. ` +
    "For CMM (country+cybersecurity): stageNumber is 1-5 (1=Start-up, 2=Formative, 3=Established, 4=Strategic, 5=Dynamic), grouped under the 5 real Dimensions. For the other 3 combinations: stageNumber is 1-4 matching the real NIST-style tiers (1=Partial, 2=Risk Informed, 3=Repeatable, 4=Adaptive), with all Functions/Areas grouped under ONE dimension named after the framework. Use stageNumber 0 with stage \"Unable to assess\" for anything you genuinely couldn't assess from the conversation. Cover every real Factor/Function/Area actually discussed. This fenced block automatically becomes a real \"Done for [project]\" completion line and a \"Download Full Report (Word)\" button for the user -- it does NOT display as raw text, so don't describe or reference the JSON itself in your prose, just include the block. Only include this block once the assessment is genuinely complete, never partway through. " +
    "You still have access to real-time web search -- use it for anything current-events-related (recent breaches, new national strategies, recent GCSCC news) that wouldn't be in a static knowledge base. " +
    "Keep the same clear, direct GARNET voice as the rest of the app -- no unnecessary hedging, no markdown headers in casual replies, genuinely useful and specific rather than generic cybersecurity platitudes."
  );
}
