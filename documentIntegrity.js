// documentIntegrity.js
//
// Pure helper functions for the document integrity check in server.js.
//
// WHY THIS EXISTS: the integrity checker is an LLM judge, and a real
// production log showed it returning "failed" for a document while its own
// explanation said things like "The document does not claim any specific
// experiment, so this check is not violated". A judge that can fail a
// document without naming real evidence makes GARNET reject good PDFs again
// and again until it runs out of tool rounds and gives up. These helpers make
// the verdict depend on EVIDENCE that code can verify, not on the judge's
// say-so:
//   - a violation only counts if the judge quotes text that really appears in
//     the document (hallucinated or "can't be assessed" complaints are dropped)
//   - the "no standalone Ethics section" complaint is dropped when code can
//     see a heading containing "ethic" in the document itself
//   - after two rejected drafts in one request, only the two factual-integrity
//     checks (fabricated results, off-topic references) are still enforced

export function normalizeForMatch(s) {
  return String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

// Headings extracted by code (authoritative) from the tool-call arguments.
export function extractHeadingsFromToolArgs(toolName, argsJson) {
  try {
    const args = JSON.parse(argsJson);
    const headings = [];
    if (toolName === "create_pdf") {
      for (const s of args.sections || []) {
        if (s && (s.type === "heading" || s.type === "subheading") && s.text) headings.push(String(s.text));
      }
    } else if (toolName === "create_project_zip" || toolName === "create_latex_pdf") {
      for (const f of args.files || []) {
        const content = String((f && f.content) || "");
        for (const m of content.matchAll(/\\(?:sub)*section\*?\{([^}]*)\}/g)) headings.push(m[1]);
        for (const m of content.matchAll(/^#{1,6}\s+(.+)$/gm)) headings.push(m[1]);
      }
    }
    return headings.join("\n");
  } catch {
    return "";
  }
}

// rawViolations: array of { check: 1-4, quote: string, problem: string } as
// returned by the judge. Returns only the violations that survive verification.
export function filterIntegrityViolations(rawViolations, fullText, headingsText, relaxed) {
  if (!Array.isArray(rawViolations)) return [];
  const docNorm = normalizeForMatch(fullText);
  const hasEthicsHeading = /ethic/i.test(String(headingsText || ""));
  const kept = [];
  for (const v of rawViolations) {
    if (!v || typeof v !== "object") continue;
    const check = Number(v.check);
    if (![1, 2, 3, 4].includes(check)) continue;
    if (relaxed && check > 2) continue; // after two rejections, only factual-integrity checks remain
    const problem = String(v.problem || "").trim();
    if (!problem) continue;
    if (check === 3) {
      // Absence can't be quoted -- but code can see the real headings.
      if (hasEthicsHeading) continue;
      kept.push({ check, problem, quote: "" });
      continue;
    }
    const quote = normalizeForMatch(v.quote);
    if (quote.length < 8 || !docNorm.includes(quote)) continue; // no verifiable evidence -> not a violation
    kept.push({ check, problem, quote: String(v.quote).trim() });
  }
  return kept;
}

export function formatViolations(violations) {
  return violations
    .map((v) => `(${v.check}) ${v.problem}${v.quote ? ` -- evidence: "${v.quote.slice(0, 200)}"` : ""}`)
    .join(" ");
}
