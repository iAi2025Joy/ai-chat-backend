// pdfTool.js
//
// The create_pdf tool: a single real, downloadable PDF file. Added
// specifically because GARNET was telling users PDF export needed an
// entirely separate, not-yet-built "Document Creator" model -- which
// overstated the real gap. Following the EXACT same architecture
// already proven for create_project_zip (projectZipTool.js): the
// server only sends structured content in a marker div; the actual
// PDF bytes are built CLIENT-SIDE in the browser (see buildPdfBlob in
// app.js), using jsPDF -- a well-established, pure client-side
// library, so this adds no new server-side npm dependency, no system
// LaTeX/Chromium install on Render, and no new backend attack surface.
// This is intentionally a simpler format than a full LaTeX document
// (headings/paragraphs/simple tables, not real typeset math) -- it's
// for a genuine "give me a PDF I can open and read" request, not a
// replacement for the LaTeX/Overleaf path when real academic
// typesetting/math notation is actually needed.

export function getCreatePdfToolDefinition() {
  return {
    type: "function",
    function: {
      name: "create_pdf",
      description:
        "Create a real, downloadable single PDF file. Use this when the user explicitly asks for a PDF (not a LaTeX/Overleaf project -- use create_project_zip for that when they want real LaTeX source, or when they need genuine typeset math/academic formatting). Best for reports, summaries, or documents made of headings, paragraphs, and simple tables -- NOT for documents that need real typeset mathematical notation, since this produces plain formatted text/tables, not LaTeX-quality math typesetting. For a research paper, report, or other document where the person asked for something \"full\", \"detailed\", \"complete\", or \"professional\", follow the MATCH THE REAL DEPTH/LENGTH checklist defined elsewhere in this system exactly (real literature review, analysis/discussion, ethics section where it applies, tables, a genuine conclusion, real references) -- that checklist applies to a PDF exactly the same way it applies to a LaTeX project, not a lighter version of it. This DIRECTLY renders a real download card for the user automatically -- do not also paste the content again as a code block or repeat it in your text. After calling this, continue your response normally with a short sentence of context -- you don't need to repeat the content, the card already lets them download and open it.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Document title, e.g. 'Q3 Sales Report' -- used as the PDF's title page heading and filename." },
          sections: {
            type: "array",
            description: "The real content, in order, as a sequence of typed sections.",
            items: {
              type: "object",
              properties: {
                type: { type: "string", enum: ["heading", "subheading", "paragraph", "table", "bullets"], description: "The kind of section this is." },
                text: { type: "string", description: "For type 'heading', 'subheading', or 'paragraph': the real text content." },
                items: { type: "array", items: { type: "string" }, description: "For type 'bullets': each real bullet point's text." },
                rows: {
                  type: "array",
                  description: "For type 'table': each row as an array of real cell strings. The first row is treated as the header row.",
                  items: { type: "array", items: { type: "string" } },
                },
              },
              required: ["type"],
            },
          },
        },
        required: ["title", "sections"],
      },
    },
  };
}

export function handleCreatePdfCall(argsJson) {
  let args = {};
  try {
    args = argsJson ? JSON.parse(argsJson) : {};
  } catch (err) {
    console.error("create_pdf: could not parse arguments JSON:", err.message, "raw:", argsJson);
    return { toolResult: JSON.stringify({ error: "Could not parse PDF arguments." }), pdfHtml: null };
  }

  const { title, sections } = args;
  if (!title || typeof title !== "string" || !title.trim()) {
    console.error("create_pdf: validation failed -- title is required.", "raw args:", JSON.stringify(args).slice(0, 500));
    return { toolResult: JSON.stringify({ error: "title is required and must be a non-empty string." }), pdfHtml: null };
  }
  if (!Array.isArray(sections) || sections.length === 0) {
    console.error("create_pdf: validation failed -- sections must be a non-empty array.", "raw args:", JSON.stringify(args).slice(0, 500));
    return { toolResult: JSON.stringify({ error: "sections must be a non-empty array." }), pdfHtml: null };
  }
  const validTypes = new Set(["heading", "subheading", "paragraph", "table", "bullets"]);
  for (const s of sections) {
    if (!s || !validTypes.has(s.type)) {
      console.error("create_pdf: validation failed -- invalid section type.", "raw args:", JSON.stringify(args).slice(0, 500));
      return { toolResult: JSON.stringify({ error: "Each section needs a valid type: heading, subheading, paragraph, table, or bullets." }), pdfHtml: null };
    }
  }

  const payload = {
    title: title.trim(),
    sections,
  };
  const safeJson = JSON.stringify(payload)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const pdfHtml = `<div class="create-pdf" data-pdf="${safeJson}"></div>`;

  console.log(`create_pdf: SUCCESS. title=${JSON.stringify(title)}, sectionCount=${sections.length}`);

  return {
    toolResult: JSON.stringify({
      success: true,
      note: "PDF created and a download card will be shown to the user automatically. Do not repeat the content as a code block or in your text -- just continue your response normally.",
    }),
    pdfHtml,
  };
}
