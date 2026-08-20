// latexPdfTool.js
//
// The create_latex_pdf tool: takes real LaTeX source (the same kind of
// content create_project_zip already builds) and ACTUALLY COMPILES it
// server-side into a real, correctly-typeset PDF -- via
// latex.ytotech.com's free, open-source /builds/sync API (a real,
// public LaTeX-on-HTTP service; verified directly before use, same
// practice already followed elsewhere in this codebase for other CDN/
// API URLs).
//
// Why this exists as a THIRD document tool, distinct from both
// create_pdf and create_project_zip: per explicit request, GARNET must
// give the person the exact real file type they actually asked for --
// if they say "pdf", they get a real .pdf, even for a paper that
// genuinely needs proper two-column academic typesetting (which
// create_pdf's simple jsPDF-based renderer cannot produce); if they
// say "zip"/"overleaf"/"latex project", they get the raw LaTeX source
// via create_project_zip instead, unchanged. Silently swapping one for
// the other in either direction was a confirmed real complaint. This
// tool is what makes "give me a real, properly-typeset PDF of a
// USENIX-formatted paper" actually possible, rather than requiring the
// person to compile it themselves.
//
// Real, honest limitation to know about: latex.ytotech.com is a free
// community service with no SLA and real-world rate limiting -- not
// bulletproof production infrastructure. handleCreateLatexPdfCall
// below fails gracefully (returns a clear error the model can explain
// and offer create_project_zip as a fallback for) rather than silently
// producing nothing if the compile call fails.

const YTOTECH_BUILD_URL = "https://latex.ytotech.com/builds/sync";

export function getCreateLatexPdfToolDefinition() {
  return {
    type: "function",
    function: {
      name: "create_latex_pdf",
      description:
        "Actually compiles real LaTeX source into a real, correctly-typeset PDF file server-side, and gives the user a real downloadable .pdf -- not the LaTeX source itself. Use this specifically when the user explicitly asks for a PDF (the word 'pdf' or equivalent) AND the document genuinely needs real LaTeX-quality typesetting that create_pdf's simpler renderer can't do -- real typeset math/equations, a specific named academic venue's two-column format (USENIX, IEEE, ACM, etc.), or any other case where true LaTeX output quality matters. If the user instead explicitly asks for the LaTeX source itself, a '.zip', 'Overleaf', or a 'LaTeX project' to edit themselves, use create_project_zip instead, NOT this tool -- always match the literal file type/format the person actually asked for. This can take noticeably longer than create_pdf since it's a real compilation step, and can occasionally fail if there's a genuine LaTeX error in the content or the external compile service is temporarily unavailable -- if it fails, explain what happened honestly and offer create_project_zip (the raw LaTeX source) as a fallback so the person isn't left with nothing. This DIRECTLY renders a real download card for the user automatically -- do not also paste the content again as a code block or repeat it in your text.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Document title, used as the filename, e.g. 'USENIX Drone Research Paper'." },
          mainFilename: { type: "string", description: "The filename of the main .tex file within the files array below, e.g. 'main.tex'. Must exactly match one of the filenames in files." },
          files: {
            type: "array",
            description: "Every real file needed to compile (the main .tex file plus any real .bib/.cls/.sty files it references). Write real, complete, working content for each -- never a placeholder.",
            items: {
              type: "object",
              properties: {
                filename: { type: "string" },
                content: { type: "string" },
              },
              required: ["filename", "content"],
            },
          },
        },
        required: ["title", "mainFilename", "files"],
      },
    },
  };
}

export async function handleCreateLatexPdfCall(argsJson) {
  let args = {};
  try {
    args = argsJson ? JSON.parse(argsJson) : {};
  } catch (err) {
    console.error("create_latex_pdf: could not parse arguments JSON:", err.message, "raw:", argsJson);
    return { toolResult: JSON.stringify({ error: "Could not parse create_latex_pdf arguments." }), latexPdfHtml: null };
  }

  const { title, mainFilename, files } = args;
  if (!title || typeof title !== "string" || !title.trim()) {
    return { toolResult: JSON.stringify({ error: "title is required." }), latexPdfHtml: null };
  }
  if (!mainFilename || typeof mainFilename !== "string") {
    return { toolResult: JSON.stringify({ error: "mainFilename is required and must match one of the files' filenames." }), latexPdfHtml: null };
  }
  if (!Array.isArray(files) || files.length === 0) {
    return { toolResult: JSON.stringify({ error: "files must be a non-empty array." }), latexPdfHtml: null };
  }
  const mainFile = files.find((f) => f && f.filename === mainFilename);
  if (!mainFile) {
    return { toolResult: JSON.stringify({ error: `mainFilename "${mainFilename}" does not match any file in files.` }), latexPdfHtml: null };
  }

  const resources = [
    { main: true, content: mainFile.content },
    ...files.filter((f) => f.filename !== mainFilename).map((f) => ({ path: f.filename, content: f.content })),
  ];

  let compileResponse;
  try {
    compileResponse = await fetch(YTOTECH_BUILD_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ compiler: "pdflatex", resources }),
      timeout: 45000,
    });
  } catch (err) {
    console.error("create_latex_pdf: network error calling latex.ytotech.com:", err.message);
    return {
      toolResult: JSON.stringify({
        error: "Could not reach the LaTeX compilation service (network error). Suggest offering create_project_zip (the raw LaTeX source) as a fallback so the user isn't left with nothing, and explain honestly that the real-PDF compile step failed.",
      }),
      latexPdfHtml: null,
    };
  }

  const contentType = compileResponse.headers.get("content-type") || "";

  if (!compileResponse.ok || !contentType.includes("application/pdf")) {
    // A real compile error -- the service returns JSON with logs in
    // this case, not a PDF. Surface a REAL, honest error back to the
    // model rather than pretending it worked.
    let errorDetail = `HTTP ${compileResponse.status}`;
    try {
      const errorJson = await compileResponse.json();
      errorDetail = JSON.stringify(errorJson).slice(0, 800);
    } catch {
      // response wasn't JSON either -- keep the HTTP status as the detail
    }
    console.error("create_latex_pdf: compile failed:", errorDetail);
    return {
      toolResult: JSON.stringify({
        error: `The LaTeX did not compile successfully (${errorDetail}). Suggest offering create_project_zip (the raw LaTeX source) as a fallback so the user isn't left with nothing, and explain honestly that the compile step failed rather than claiming success.`,
      }),
      latexPdfHtml: null,
    };
  }

  // A confirmed real bug this fixes: used .buffer() here, a node-fetch
  // v2-only convenience method -- this project runs node-fetch v3 (see
  // package.json), which removed it in favor of the standard
  // .arrayBuffer(). Every real LaTeX compile that actually succeeded
  // was crashing right here with "compileResponse.buffer is not a
  // function", right after the hard part (the actual compile) had
  // already worked -- confirmed directly from a real server stack
  // trace, not inferred.
  const arrayBuffer = await compileResponse.arrayBuffer();
  const pdfBuffer = Buffer.from(arrayBuffer);
  const base64Pdf = pdfBuffer.toString("base64");

  const payload = { title: title.trim(), base64Pdf };
  const safeJson = JSON.stringify(payload)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const latexPdfHtml = `<div class="create-pdf" data-compiled-pdf="${safeJson}"></div>`;

  console.log(`create_latex_pdf: SUCCESS. title=${JSON.stringify(title)}, compiledSizeBytes=${pdfBuffer.length}`);

  return {
    toolResult: JSON.stringify({
      success: true,
      note: "A real, compiled PDF was produced and a download card will be shown to the user automatically. Do not repeat the content as a code block or in your text -- just continue your response normally.",
    }),
    latexPdfHtml,
  };
}
