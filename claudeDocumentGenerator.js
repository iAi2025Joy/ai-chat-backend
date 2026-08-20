// claudeDocumentGenerator.js
//
// A focused PILOT: uses the Claude API (Anthropic) instead of OpenAI
// specifically for drafting long-form documents (research papers,
// reports) via create_pdf / create_project_zip / create_latex_pdf --
// per explicit request, after this exact task repeatedly showed the
// same two failures under OpenAI's o3 even after multiple rounds of
// increasingly specific prompt fixes (fabricated "real" experimental
// results, and citations recycled from an unrelated earlier topic).
// Scoped deliberately narrow rather than a full backend rewrite:
// - Reuses the EXACT SAME tool-handler functions already used by the
//   OpenAI flow (handleCreatePdfCall, handleCreateProjectZipCall,
//   handleCreateLatexPdfCall) -- these just take a JSON arguments
//   string and are completely LLM-agnostic, so no duplication needed.
// - Reuses the EXACT SAME frontend rendering -- the marker-div HTML
//   these handlers produce is identical regardless of which model
//   generated the arguments, so app.js needs zero changes.
// - Keeps the document INTEGRITY CHECK on the OpenAI side (gpt-4o) --
//   that's a narrow, cheap, already-tested check unrelated to which
//   model drafted the content; no reason to duplicate it here too.
// - Uses Claude's own server-side web_search tool (built into the
//   Messages API directly) for real, current references, rather than
//   reimplementing search separately.

import Anthropic from "@anthropic-ai/sdk";
import { getCreatePdfToolDefinition, handleCreatePdfCall } from "./pdfTool.js";
import { getCreateProjectZipToolDefinition, handleCreateProjectZipCall } from "./projectZipTool.js";
import { getCreateLatexPdfToolDefinition, handleCreateLatexPdfCall } from "./latexPdfTool.js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const CLAUDE_DOC_MODEL = "claude-opus-5"; // matches o3's role as the highest-reasoning tier, for this specific heavy-drafting task

// Converts the existing OpenAI-format tool definitions (already written
// and battle-tested for pdfTool.js/projectZipTool.js/latexPdfTool.js)
// into Claude's Messages API tool shape ({name, description,
// input_schema}) -- same real schema, just a different wrapper key, so
// this avoids maintaining two separately-hand-written copies of each
// tool's parameters that could drift out of sync with each other.
function toClaudeTool(openAiToolDef) {
  const fn = openAiToolDef.function;
  return { name: fn.name, description: fn.description, input_schema: fn.parameters };
}

const CLAUDE_DOC_SYSTEM_PROMPT =
  "You are GARNET's document-drafting engine for long-form research papers and reports, reached specifically when someone asks for a full/detailed/professional document. Write with genuine academic/professional rigor -- this is the same standard GARNET's Science and Research model holds itself to elsewhere, now enforced here directly. " +
  "GO DEEP: don't stop at the minimum. Explain real underlying mechanisms, cover real edge cases and tradeoffs, and match any length/structure the person specifies (an exact total page count is a hard constraint if they give one; per-section targets are relative weights to preserve if their own numbers don't add up consistently -- say briefly what you did if you had to make that judgment call). " +
  "A REAL, COMPLETE PAPER NEEDS: a genuine multi-paragraph introduction; a literature review that SYNTHESIZES real sources (where they agree, conflict, and what gap remains -- not a flat list); real technical depth in the methodology; a real analysis/discussion section reasoning about implications and tradeoffs; a genuine ethics/ethical-considerations section wherever the topic involves people, data, AI, or society; real tables and, where the tool supports it, charts; a genuine conclusion that synthesizes findings, not a one-line restatement; and real references. " +
  "NEVER FABRICATE REAL-WORLD RESULTS: do not describe a specific real experiment, deployment, field trial, or user study (a specific number of participants, households, rooms, devices, testbeds, or duration) as having actually been conducted, with specific numbers presented as genuinely measured -- unless it's genuinely true. A proposed, clearly-labeled FUTURE evaluation plan is fine and often valuable; presenting invented results as real measurements is a serious integrity violation, not a detail. " +
  "REFERENCES MUST BE GENUINELY RELEVANT AND REAL: use the web_search tool to find real, current, topically-relevant sources for THIS specific document's actual subject. Never reuse a citation from a different topic just because it's a real paper you're aware of -- every reference must genuinely support a real claim in THIS document. Only cite real academic-caliber sources (peer-reviewed journals, conference proceedings, arXiv, official regulatory documents) -- never blog posts or social media essays, even if genuinely real. " +
  "TOOL CHOICE -- match the person's own words: create_latex_pdf if they said \"pdf\" for a document needing real typeset math or a named academic venue's exact two-column format (USENIX, IEEE, ACM, etc.); create_pdf if they said \"pdf\" for a simpler document; create_project_zip if they said \"zip\"/\"Overleaf\"/\"LaTeX source\". Never silently substitute one file type for another. " +
  "A CUSTOM OUTLINE IS A FLOOR, NOT A CEILING -- READ THIS FIRST, HIGH-PRIORITY RULE (a confirmed real bug this fixes: given a detailed, professional, section-by-section outline naming venues like IEEE/ACM/USENIX, a delivered paper matched that outline's own structure well, but the abstract came in noticeably under the person's own stated word target, and no standalone ethics/ethical-considerations section appeared at all -- because the person's own outline happened not to itemize one, even though this is one of GARNET's own standing requirements). When someone gives you their own detailed structure/outline for a paper, follow it closely -- but treat it as the MINIMUM required structure, not the complete list of everything the paper needs. Every other requirement defined elsewhere in this system (a real ethics/ethical-considerations section wherever the topic involves people/data/AI/society, real synthesized literature review, genuine analysis/discussion, no fabricated results, real topically-relevant references) still applies IN FULL on top of their outline, even for sections they didn't explicitly ask for. If they gave an explicit word-count or page target for a specific section (e.g. \"abstract ~250 words\"), hit that target for real -- check the actual word count of what you wrote before finishing, don't estimate. " +
  "NEVER PRODUCE GENERIC TEMPLATE/PLACEHOLDER CONTENT -- READ THIS FIRST, HIGH-PRIORITY RULE (a confirmed real bug this fixes: a delivered paper still had \\\\author{Your Name \\\\and Your Institution} literally unfilled, imported the lipsum placeholder-text package, listed every reference author as generic \\\"Author, A.\\\"/\\\"Author, B.\\\"/etc., and never once actually used \\\\cite{} anywhere in the body text despite having a bibliography -- a bare, unfinished-looking template, not a real paper). Every part of the document must be real, finished, specific content: a real plausible author/institution or a clearly placeholder-free omission if none was given, real author names for every reference (found via web_search, not \\\"Author, X\\\"), and REAL \\\\cite{} commands actually used throughout the body text tying claims to the specific sources that support them -- a references list that's never cited from the body is exactly as broken as no references at all. Never import lipsum or leave any \\\\textbf{TODO}/\\\"Your Name\\\"/\\\"Lorem ipsum\\\"-style placeholder anywhere in a delivered document. " +
  "After calling the document tool successfully, continue with one short sentence of context -- the tool already renders a real download card, so don't repeat the content or paste it again as a code block.";

// Runs the actual Claude-based tool-calling loop for one document
// request. Deliberately takes ONLY the current user message -- no
// prior conversation history -- since the confirmed real bug this
// whole pilot exists to fix was citations/content getting reused from
// an earlier, unrelated topic discussed earlier in the same
// conversation. Warning the model not to do that (as an earlier draft
// of this function did, by passing history alongside a "don't reuse
// this" instruction) still leaves the contamination available to
// reach for; not exposing it at all removes the risk structurally
// instead of relying on the model to resist it, the same lesson
// learned from every other fix in this session that held up better as
// a structural change than as an instruction.
// `requestedFormat` ("pdf" | "zip" | null) comes from
// detectRequestedDocumentFormat in toolDetectors.js -- when it's not
// null, this RESTRICTS which document tools are even offered to the
// model (see below), rather than trusting a written instruction to
// pick the right one, since that written instruction already failed
// once for exactly this case.
// `sendEvent` (optional) lets this emit real, tool-specific status
// updates AS each tool is actually called, instead of one generic
// status guessed before any tool choice is even made -- a confirmed
// real complaint this fixes (a status claiming "working on latex" when
// the person asked for, and should have gotten, a plain PDF).
// Returns { text, docHtml } where docHtml is whichever marker-div HTML
// the underlying tool produced (or null if no document tool was
// actually successfully called), in the exact same format the OpenAI
// flow already knows how to append to formattedReply.
export async function generateDocumentWithClaude(userMessage, requestedFormat, sendEvent) {
  const emit = (status) => { if (sendEvent) sendEvent({ status }); };

  const allTools = {
    create_pdf: toClaudeTool(getCreatePdfToolDefinition()),
    create_project_zip: toClaudeTool(getCreateProjectZipToolDefinition()),
    create_latex_pdf: toClaudeTool(getCreateLatexPdfToolDefinition()),
  };

  // Restrict the actual tool list based on the person's own literal
  // words -- this is what makes the file type reliable, not the
  // system prompt's wording alone.
  let documentTools;
  if (requestedFormat === "zip") {
    documentTools = [allTools.create_project_zip];
  } else if (requestedFormat === "pdf") {
    documentTools = [allTools.create_pdf, allTools.create_latex_pdf]; // model still picks between the simple vs. real-compile PDF path based on content needs
  } else {
    documentTools = [allTools.create_pdf, allTools.create_project_zip, allTools.create_latex_pdf];
  }

  const tools = [{ type: "web_search_20250305", name: "web_search" }, ...documentTools];

  const messages = [{ role: "user", content: userMessage }];

  let docHtml = null;
  let finalText = "";
  const MAX_ROUNDS = 10; // document generation genuinely needs more real rounds than a typical chat turn -- searching real references, then the actual document call
  let round = 0;

  while (round < MAX_ROUNDS) {
    round++;
    const response = await anthropic.messages.create({
      model: CLAUDE_DOC_MODEL,
      max_tokens: 8000,
      system: CLAUDE_DOC_SYSTEM_PROMPT,
      messages,
      tools,
    });

    const toolUseBlocks = response.content.filter((b) => b.type === "tool_use");
    const textBlocks = response.content.filter((b) => b.type === "text");
    finalText = textBlocks.map((b) => b.text).join("\n") || finalText;

    if (toolUseBlocks.length === 0) {
      // No more tool calls -- Claude is done, this is the real final answer.
      break;
    }

    messages.push({ role: "assistant", content: response.content });

    const toolResultBlocks = [];
    for (const toolUse of toolUseBlocks) {
      let resultText = "";
      let successHtml = null;

      if (toolUse.name === "create_pdf") {
        emit("Writing the PDF content (this can take longer for a detailed document)");
        const { toolResult, pdfHtml } = handleCreatePdfCall(JSON.stringify(toolUse.input));
        resultText = toolResult;
        successHtml = pdfHtml;
      } else if (toolUse.name === "create_project_zip") {
        emit("Writing the LaTeX project files (this can take longer for a detailed document)");
        const { toolResult, zipHtml } = handleCreateProjectZipCall(JSON.stringify(toolUse.input));
        resultText = toolResult;
        successHtml = zipHtml;
      } else if (toolUse.name === "create_latex_pdf") {
        emit("Compiling the LaTeX into a real PDF (this can take a bit longer, and occasionally fails if the compile service is busy)");
        const { toolResult, latexPdfHtml } = await handleCreateLatexPdfCall(JSON.stringify(toolUse.input));
        resultText = toolResult;
        successHtml = latexPdfHtml;
      } else {
        // web_search is a server-side tool Claude executes itself --
        // its results arrive as additional content blocks in the SAME
        // response automatically, not something this loop needs to
        // manually handle here.
        emit("Searching for real sources");
        continue;
      }

      if (successHtml) docHtml = successHtml;
      toolResultBlocks.push({ type: "tool_result", tool_use_id: toolUse.id, content: resultText });
    }

    if (toolResultBlocks.length > 0) {
      messages.push({ role: "user", content: toolResultBlocks });
    }
  }

  return { text: finalText, docHtml };
}
