// projectZipTool.js
//
// The create_project_zip tool: multi-file downloadable project bundles
// (e.g. a LaTeX/Overleaf project with several real files). Split out of
// server.js as its own module for the same reason as chartTool.js --
// isolated, independently editable, no risk of side effects on
// unrelated services. Only getCreateProjectZipToolDefinition and
// handleCreateProjectZipCall are exported.

// ------------------------------------------------------------------
// CREATE_PROJECT_ZIP TOOL -- for multi-file projects (a LaTeX/Overleaf
// project with main.tex + references.bib + a .cls/.sty file, or any
// other multi-file code project) that genuinely need several real
// files, not just one code block. GPT provides real filenames and real
// file contents; the server packages them into a marker div the
// frontend turns into an actual downloadable .zip -- the actual ZIP
// bytes are built CLIENT-SIDE (see buildZipBlob in index.html), not
// here, since that avoids adding a new server-side npm dependency for
// something the browser can do natively with a small, hand-verified
// ZIP writer (tested directly against Python's zipfile module and the
// system unzip tool before ever being wired into the app).
// ------------------------------------------------------------------

export function getCreateProjectZipToolDefinition() {
  return {
    type: "function",
    function: {
      name: "create_project_zip",
      description:
        "Create a downloadable .zip file containing MULTIPLE real files -- use this specifically for a multi-file LaTeX/Overleaf project (e.g. main.tex plus references.bib plus a custom .cls/.sty file, or files organized into subfolders like sections/intro.tex) or any other project that genuinely needs several separate files to work together. Do NOT use this for a single file -- if the user just wants one LaTeX document, one Python script, etc., use a normal fenced code block instead (```latex, ```python, etc.), which already renders as its own code window with a copy button; only reach for this tool when there are genuinely multiple files that belong together as a project. This DIRECTLY renders a real download card for the user automatically -- do not also paste the file contents as code blocks in your text, that would just duplicate what's already downloadable. After calling this, continue your response normally with a short sentence of context (e.g. what the project does, how to use it in Overleaf) -- you don't need to list out the files again, the card already shows them.",
      parameters: {
        type: "object",
        properties: {
          projectName: { type: "string", description: "Short project name, e.g. 'IEEE Conference Paper' -- used as the zip's display title and filename." },
          files: {
            type: "array",
            description: "Every real file the project needs. Use forward slashes for subfolders, e.g. 'sections/intro.tex'.",
            items: {
              type: "object",
              properties: {
                filename: { type: "string", description: "Relative path/filename within the project, e.g. 'main.tex' or 'sections/intro.tex'." },
                content: { type: "string", description: "The REAL, complete content of this file. Never a placeholder or 'TODO' -- write the actual working content." },
              },
              required: ["filename", "content"],
            },
          },
        },
        required: ["projectName", "files"],
      },
    },
  };
}

export function handleCreateProjectZipCall(argsJson) {
  let args = {};
  try {
    args = argsJson ? JSON.parse(argsJson) : {};
  } catch (err) {
    console.error("create_project_zip: could not parse arguments JSON:", err.message, "raw:", argsJson);
    return { toolResult: JSON.stringify({ error: "Could not parse project arguments." }), zipHtml: null };
  }

  const { projectName, files } = args;
  if (!Array.isArray(files) || files.length === 0) {
    console.error("create_project_zip: validation failed -- files must be a non-empty array.", "raw args:", JSON.stringify(args).slice(0, 500));
    return { toolResult: JSON.stringify({ error: "files must be a non-empty array of {filename, content} objects." }), zipHtml: null };
  }
  if (files.length < 2) {
    // Not a hard failure -- still build it if asked, but steer future
    // calls back toward the simpler, already-working code-block path
    // for genuinely single-file requests.
    console.error("create_project_zip: called with only 1 file -- a single file should normally use a fenced code block instead.", "raw args:", JSON.stringify(args).slice(0, 300));
  }
  for (const f of files) {
    if (!f || typeof f.filename !== "string" || !f.filename.trim() || typeof f.content !== "string") {
      console.error("create_project_zip: validation failed -- each file needs a real filename and content.", "raw args:", JSON.stringify(args).slice(0, 500));
      return { toolResult: JSON.stringify({ error: "Each file needs a non-empty 'filename' string and a 'content' string." }), zipHtml: null };
    }
  }

  const payload = {
    projectName: projectName || "project",
    files: files.map((f) => ({
      filename: f.filename.trim(),
      // Same convertLinksToHTML protection already used for charts/code
      // -- LaTeX files commonly contain real URLs (\url{...}, bib entry
      // url fields) that would otherwise get an <a> tag injected into
      // the middle of the file content sitting in this HTML attribute.
      // Reversed by the frontend right before the ZIP bytes are built.
      content: f.content.replace(/:\/\//g, ":%2F%2F"),
    })),
  };
  const safeJson = JSON.stringify(payload)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const zipHtml = `<div class="project-zip" data-zip="${safeJson}"></div>`;

  console.log(`create_project_zip: SUCCESS. projectName=${JSON.stringify(projectName || "")}, fileCount=${files.length}, files=${files.map((f) => f.filename).join(", ")}`);

  return {
    toolResult: JSON.stringify({
      success: true,
      note: "Project zip created and a download card will be shown to the user automatically. Do not repeat the file contents as code blocks -- just continue your response normally.",
    }),
    zipHtml,
  };
}
