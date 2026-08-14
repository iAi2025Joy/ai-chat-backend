// assessmentReportGenerator.js
//
// Generates real assessment reports for the 3 non-CMM assessment types
// (company+cybersecurity via NIST CSF, company+privacy via NIST Privacy
// Framework, country+privacy via the OECD/UNCTAD/Convention 108+
// synthesis -- see assessmentFrameworks.js for their real content).
// Deliberately outputs the SAME {executiveSummary,
// topPriorityRecommendations, dimensions: [{name, factors: [...]}]}
// shape the existing CMM report already uses, wrapping the framework's
// flat Function/Area list as a single "dimension" -- this lets the
// already-working renderCmmReportMarkdown/buildCmmReportDocx in
// cybersecurityModel.js be reused UNCHANGED for all 4 assessment types,
// rather than duplicating that logic.

import { getAssessmentQuestions, getStageNamesFor, getFrameworkSourceName } from "./assessmentFrameworks.js";

export async function buildGenericAssessmentReport(openaiClient, level, domain, projectName, answers) {
  const questions = getAssessmentQuestions(level, domain);
  if (!questions) return null; // country+cybersecurity should use buildCmmAssessmentReport instead

  const stageNames = getStageNamesFor(level, domain);
  const frameworkSource = getFrameworkSourceName(level, domain);
  const maxStage = stageNames.length - 1;
  const stageListText = stageNames.slice(1).map((name, i) => `${i + 1}=${name}`).join(", ");

  const sections = answers
    .map((a) => {
      const item = questions.find((q) => q.id === a.factorId);
      if (!item) return null;
      return (
        `### ${item.id} ${item.name}\n` +
        `Real framework description/criteria:\n${item.description}\n\n` +
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
          `You are generating a real ${domain === "privacy" ? "privacy" : "cybersecurity"} maturity assessment report for a ${level === "company" ? "company/organization" : "country"}, grounded in the real ${frameworkSource}. ` +
          `${projectName ? `The project is called "${projectName}". ` : ""}` +
          `For each item below, you're given its real framework description and the person's own real answer describing their situation. ` +
          `Respond with ONLY a JSON object, no other text, matching this EXACT shape: ` +
          `{"executiveSummary": "2-4 sentences on overall strengths and gaps", "topPriorityRecommendations": ["...", "...", "..."], "factors": [{"id": "...", "name": "...", "stage": "...", "stageNumber": 1-${maxStage}, "rationale": "...", "recommendation": "..."}]}. ` +
          `stageNumber must be an integer matching stage exactly: ${stageListText}. If an answer was left blank or too vague to assess, still include the item with stage "Unable to assess", stageNumber 0, and say so honestly rather than guessing. Be honest in rationale text that this is a self-assessment from answers, not a formal independent audit.`,
      },
      { role: "user", content: sections },
    ],
    response_format: { type: "json_object" },
    max_tokens: 4000,
  });

  const raw = response.choices?.[0]?.message?.content || "{}";
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error("Generic assessment report JSON parse failed:", err.message, "raw:", raw.slice(0, 500));
    return null;
  }

  // Wraps the flat factor list as a single "dimension" so the existing
  // CMM render/docx functions (which expect report.dimensions[].factors)
  // work unchanged for these frameworks too.
  return {
    executiveSummary: parsed.executiveSummary,
    topPriorityRecommendations: parsed.topPriorityRecommendations,
    dimensions: [{ name: frameworkSource, factors: parsed.factors || [] }],
    frameworkSource,
    level,
    domain,
    projectName,
  };
}
