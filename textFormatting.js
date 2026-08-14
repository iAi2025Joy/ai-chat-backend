// textFormatting.js
//
// Converts GPT's raw text output into the HTML the frontend actually
// renders. Split out of server.js as its own module so future changes
// to markdown/link formatting (bold, lists, code blocks, chart/mermaid
// fenced blocks, raw URL linkification) cannot accidentally break
// anything else in server.js -- this file has zero dependencies on any
// other module, and nothing else depends on its internals beyond the
// two functions it exports.


export function convertLinksToHTML(text) {
  // Improved regex: avoids capturing trailing punctuation like ) , . etc.,
  // AND stops at '<' so it doesn't swallow an immediately-following HTML
  // tag (e.g. a URL right before a closing </p> from formatMarkdownToHTML,
  // with no whitespace in between) -- found and fixed via direct testing,
  // not assumed.
  const urlRegex = /(https?:\/\/[^\s)>,<]+)/g;
  return text.replace(urlRegex, '<a href="$1" target="_blank" style="color:#4ea3ff;text-decoration:underline;">$1</a>');
}

// ✅ Converts GPT's typical markdown-style output (bold, bullet lists,
// numbered lists, line breaks, ```mermaid fenced diagram blocks, and now
// ```chart fenced price-history blocks) into HTML the frontend can
// actually render, since the chat widget displays replies via innerHTML
// but GPT commonly defaults to markdown syntax unless the raw text is
// converted first.
export function formatMarkdownToHTML(text) {
  if (!text) return text;

  // Extract ```mermaid ... ``` fenced blocks FIRST, before any line-by-line
  // processing touches them -- Mermaid diagram syntax spans multiple lines
  // with its own internal structure (arrows, node definitions, etc.) that
  // would be corrupted if run through the paragraph/heading/list logic
  // below. Replaced with placeholder tokens, restored after everything
  // else is processed.
  const mermaidBlocks = [];
  let textWithPlaceholders = text.replace(
    /```mermaid\s*\n([\s\S]*?)```/g,
    (match, diagramCode) => {
      const placeholder = `@@MERMAID_BLOCK_${mermaidBlocks.length}@@`;
      // The frontend looks for elements with class="mermaid" and renders
      // them via the Mermaid.js library loaded on the page.
      mermaidBlocks.push(`<div class="mermaid">${diagramCode.trim()}</div>`);
      return placeholder;
    }
  );

  // ✅ NEW: Extract ```chart ... ``` fenced blocks the same way, BEFORE
  // line-by-line processing, for the same reason (the content inside is a
  // single JSON object, not text meant to be turned into paragraphs/lists).
  // Emits a placeholder <div class="price-chart" data-chart="...escaped
  // JSON..."> that the frontend picks up and renders into a real Chart.js
  // line chart, the same "backend emits a marker div, frontend does the
  // actual rendering" pattern already used for Mermaid.
  const chartBlocks = [];
  textWithPlaceholders = textWithPlaceholders.replace(
    /```chart\s*\n([\s\S]*?)```/g,
    (match, chartJsonRaw) => {
      const placeholder = `@@CHART_BLOCK_${chartBlocks.length}@@`;
      let safeJson = "{}";
      try {
        // Validate it's real JSON before trusting it, and re-serialize so
        // formatting from the model doesn't matter -- then HTML-attribute-
        // escape it so it survives being placed inside data-chart="...".
        const parsedChart = JSON.parse(chartJsonRaw.trim());
        safeJson = JSON.stringify(parsedChart)
          .replace(/&/g, "&amp;")
          .replace(/"/g, "&quot;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
      } catch (err) {
        console.error("Failed to parse ```chart block JSON from model output:", err.message);
        chartBlocks.push(`<p><em>(Chart could not be displayed -- invalid chart data.)</em></p>`);
        return placeholder;
      }
      chartBlocks.push(
        `<div class="price-chart" data-chart="${safeJson}"><canvas></canvas></div>`
      );
      return placeholder;
    }
  );

  // ✅ NEW: Extract ```cmm-report ... ``` fenced blocks the same way,
  // same reasoning as ```chart above -- the content is a single JSON
  // object (a structured CMM assessment report), not text meant to
  // become paragraphs. Emitted only at the END of a completed guided
  // Cybersecurity conversation (see buildCybersecurityModelInstructions
  // in cybersecurityModel.js). Emits a placeholder <div
  // class="cmm-report-download" data-cmm-report="...escaped JSON...">
  // that the frontend turns into a real "Download Full Report (Word)"
  // button -- same "backend emits a marker div, frontend does the
  // actual rendering/generation" pattern already used for charts,
  // images, and Mermaid diagrams.
  const cmmReportBlocks = [];
  textWithPlaceholders = textWithPlaceholders.replace(
    /```cmm-report\s*\n([\s\S]*?)```/g,
    (match, reportJsonRaw) => {
      const placeholder = `@@CMM_REPORT_BLOCK_${cmmReportBlocks.length}@@`;
      let parsedReport;
      let safeJson = "{}";
      try {
        parsedReport = JSON.parse(reportJsonRaw.trim());
        safeJson = JSON.stringify(parsedReport)
          .replace(/&/g, "&amp;")
          .replace(/"/g, "&quot;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
      } catch (err) {
        console.error("Failed to parse ```cmm-report block JSON from model output:", err.message);
        cmmReportBlocks.push(`<p><em>(Report download could not be prepared -- invalid report data.)</em></p>`);
        return placeholder;
      }
      // Same "Done for [project] -- [Country/Company]: [name] -- Date:
      // [date]" completion line the Structured Form path shows, per
      // explicit request -- built here so a completed Guided
      // Conversation report looks identical to a Structured Form one.
      const entityLabel = parsedReport.level === "company" ? "Company/Organization" : "Country";
      const dateStr = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
      const escapeText = (s) =>
        String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const completionLine = `<p style="margin-top:18px;"><strong>Done for Project: ${escapeText(parsedReport.projectName || "Untitled Assessment")} -- ${escapeText(entityLabel)}: ${escapeText(parsedReport.entityName || "N/A")} -- Date: ${escapeText(dateStr)}</strong></p>`;
      cmmReportBlocks.push(
        completionLine +
        `<div class="cmm-report-download" data-cmm-report="${safeJson}"><button class="cmm-report-download-btn" onclick="downloadCmmReportFromMessage(this)">📄 Download Full Report (Word)</button></div>`
      );
      return placeholder;
    }
  );

  // ✅ NEW: Extract ```images ... ``` fenced blocks the same way, same
  // reasoning as ```chart above. Emits a placeholder <div
  // class="web-images" data-images="...escaped JSON..."> that the
  // frontend picks up and renders as a real image gallery -- same
  // "backend emits a marker div, frontend does the actual rendering"
  // pattern already used for Mermaid and price charts.
  const imageBlocks = [];
  textWithPlaceholders = textWithPlaceholders.replace(
    /```images\s*\n([\s\S]*?)```/g,
    (match, imagesJsonRaw) => {
      const placeholder = `@@IMAGES_BLOCK_${imageBlocks.length}@@`;
      let safeJson = "{}";
      try {
        // Validate it's real JSON before trusting it, and re-serialize so
        // formatting from the model doesn't matter -- then HTML-attribute-
        // escape it so it survives being placed inside data-images="...".
        const parsedImages = JSON.parse(imagesJsonRaw.trim());
        safeJson = JSON.stringify(parsedImages)
          // convertLinksToHTML() runs on the WHOLE formatted HTML string
          // afterward (see res.json() in the /chat route) and auto-
          // linkifies any "://" it finds -- including URLs that would
          // otherwise sit inside this data-images attribute, which would
          // inject a broken <a> tag into the middle of an HTML attribute
          // and corrupt the markup. Neutralized here, reversed by the
          // frontend (see renderWebImages in index.html) right before
          // actually using each URL.
          .replace(/:\/\//g, ":%2F%2F")
          .replace(/&/g, "&amp;")
          .replace(/"/g, "&quot;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
      } catch (err) {
        console.error("Failed to parse ```images block JSON from model output:", err.message);
        imageBlocks.push(`<p><em>(Images could not be displayed -- invalid image data.)</em></p>`);
        return placeholder;
      }
      imageBlocks.push(
        `<div class="web-images" data-images="${safeJson}"></div>`
      );
      return placeholder;
    }
  );

  // Defensive safety net (same philosophy as the market-closed-statement
  // code guarantee elsewhere in this file: don't fully trust prose
  // compliance alone for a confirmed real failure mode) -- strips any
  // markdown image syntax (![alt](url)) GPT might still write directly
  // instead of a real ```images block. The frontend has no renderer for
  // raw markdown image syntax at all, so left alone this would show as
  // a confusing bracket/parenthesis jumble instead of either a real
  // image or clean text. Falls back to just the alt text, if any, so
  // the reply still reads naturally.
  textWithPlaceholders = textWithPlaceholders.replace(/!\[([^\]]*)\]\([^)]*\)/g, (match, altText) => altText || "");

  // ✅ NEW: Extract GitHub-flavored markdown tables (| col | col |) into
  // real HTML <table> elements. GPT is now explicitly instructed (see the
  // FORMATTING rule below) to use real tables for genuinely tabular data
  // (e.g. a month-by-month price breakdown) -- without this, the raw
  // "| Jan | $500 |" pipe syntax would just render as unreadable plain
  // text. Detected procedurally rather than a single regex, since a
  // table is a specific 3-part multi-line shape: a header row, a
  // dashes/colons separator row, then one or more data rows.
  const tableBlocks = [];
  {
    const rawLines = textWithPlaceholders.split("\n");
    const outputLines = [];
    const isTableRow = (l) => l.includes("|") && /\S/.test(l.replace(/\|/g, ""));
    const isSeparatorRow = (l) => /^\s*\|?[\s:-]+\|[\s:|-]*\|?\s*$/.test(l) && l.includes("-");

    const splitRow = (l) => {
      let trimmed = l.trim();
      if (trimmed.startsWith("|")) trimmed = trimmed.slice(1);
      if (trimmed.endsWith("|")) trimmed = trimmed.slice(0, -1);
      return trimmed.split("|").map((cell) => cell.trim());
    };

    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i];
      const nextLine = rawLines[i + 1] || "";
      if (isTableRow(line) && isSeparatorRow(nextLine)) {
        const headerCells = splitRow(line);
        let j = i + 2;
        const dataRows = [];
        while (j < rawLines.length && isTableRow(rawLines[j]) && !isSeparatorRow(rawLines[j])) {
          dataRows.push(splitRow(rawLines[j]));
          j++;
        }
        const placeholder = `@@TABLE_BLOCK_${tableBlocks.length}@@`;
        const theadHtml = `<thead><tr>${headerCells.map((c) => `<th>${c}</th>`).join("")}</tr></thead>`;
        const tbodyHtml = `<tbody>${dataRows.map((row) => `<tr>${row.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody>`;
        tableBlocks.push(`<div class="response-table-wrap"><table class="response-table">${theadHtml}${tbodyHtml}</table></div>`);
        outputLines.push(placeholder);
        i = j - 1; // skip past the consumed table lines
      } else {
        outputLines.push(line);
      }
    }
    textWithPlaceholders = outputLines.join("\n");
  }

  // ✅ NEW: Extract \[ ... \] display-math blocks as ONE atomic unit,
  // before line-splitting -- a confirmed real bug this fixes: asked to
  // solve an equation, GPT correctly wrote \[ ... \] display math, but
  // it rendered as literal raw text ("\[", the formula, "\]" all shown
  // unrendered) while INLINE \( \) math right next to it worked fine.
  // Root cause: the line-by-line paragraph builder further below wraps
  // EVERY line in its own separate <p> tag -- so a multi-line \[ ... \]
  // block became three separate sibling <p> elements (one for "\[", one
  // for the formula, one for "\]"), and KaTeX's auto-render extension
  // can't find a matching delimiter pair split across different DOM
  // elements like that; it only matches delimiters within the same
  // contiguous text. Pulling the whole \[ ... \] block out first and
  // re-inserting it as a single, unsplit placeholder (same technique
  // already used for mermaid/chart/table blocks) keeps the delimiter
  // pair intact in one element, where auto-render can actually find it.
  const mathDisplayBlocks = [];
  textWithPlaceholders = textWithPlaceholders.replace(
    /\\\[([\s\S]*?)\\\]/g,
    (match, formula) => {
      const placeholder = `@@MATH_DISPLAY_BLOCK_${mathDisplayBlocks.length}@@`;
      mathDisplayBlocks.push(`<div class="math-display">\\[${formula}\\]</div>`);
      return placeholder;
    }
  );

  // ✅ NEW: Extract GENERIC fenced code blocks (```python, ```java,
  // ```latex, or no language at all) into a real code-window HTML
  // structure -- a language label + copy button header, syntax-
  // highlighted body (via highlight.js, applied client-side once this
  // HTML lands in the DOM -- see renderCodeBlocks in index.html).
  // Deliberately runs AFTER the mermaid/chart/images/table extractions
  // above, which already replaced their own specific fenced languages
  // with placeholders -- so only genuinely generic code fences (any
  // other language, or none) reach this step; a stray ```chart or
  // ```mermaid block that somehow survived earlier extraction won't get
  // double-processed here.
  const codeBlocks = [];
  textWithPlaceholders = textWithPlaceholders.replace(
    /```([a-zA-Z0-9_+-]*)\n([\s\S]*?)```/g,
    (match, lang, code) => {
      const placeholder = `@@CODE_BLOCK_${codeBlocks.length}@@`;
      const safeLang = (lang || "").trim().toLowerCase();
      const displayLang = safeLang || "code";
      const escapedCode = code
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        // convertLinksToHTML() runs on the WHOLE formatted HTML
        // afterward and auto-linkifies any "://" it finds -- code often
        // contains real URLs (e.g. requests.get("https://...")) that
        // would otherwise get an <a> tag injected right into the middle
        // of the code text, breaking both its syntax highlighting and
        // its copy-paste fidelity. Neutralized here, reversed by the
        // frontend (see renderCodeBlocks in index.html) right before
        // syntax highlighting is applied.
        .replace(/:\/\//g, ":%2F%2F");
      const langClass = safeLang ? ` language-${safeLang}` : "";
      codeBlocks.push(
        `<div class="code-block">` +
          `<div class="code-block-header">` +
            `<span class="code-block-lang">${displayLang}</span>` +
            `<button class="code-block-copy-btn" onclick="copyCodeBlock(this)">Copy code</button>` +
          `</div>` +
          `<pre><code class="hljs${langClass}">${escapedCode}</code></pre>` +
        `</div>`
      );
      return placeholder;
    }
  );

  const lines = textWithPlaceholders.split("\n");
  const htmlParts = [];
  let listBuffer = [];
  let listType = null; // "ul" or "ol"

  const flushList = () => {
    if (listBuffer.length > 0) {
      const tag = listType;
      htmlParts.push(`<${tag}>` + listBuffer.map((item) => `<li>${item}</li>`).join("") + `</${tag}>`);
      listBuffer = [];
      listType = null;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const mermaidPlaceholderMatch = line.match(/^@@MERMAID_BLOCK_(\d+)@@$/);
    const chartPlaceholderMatch = line.match(/^@@CHART_BLOCK_(\d+)@@$/);
    const cmmReportPlaceholderMatch = line.match(/^@@CMM_REPORT_BLOCK_(\d+)@@$/);
    const imagesPlaceholderMatch = line.match(/^@@IMAGES_BLOCK_(\d+)@@$/);
    const tablePlaceholderMatch = line.match(/^@@TABLE_BLOCK_(\d+)@@$/);
    const codePlaceholderMatch = line.match(/^@@CODE_BLOCK_(\d+)@@$/);
    const mathDisplayPlaceholderMatch = line.match(/^@@MATH_DISPLAY_BLOCK_(\d+)@@$/);
    const headingMatch = line.match(/^(#{1,3})\s+(.*)/);
    const bulletMatch = line.match(/^[-*]\s+(.*)/);
    const numberedMatch = line.match(/^\d+\.\s+(.*)/);

    if (mermaidPlaceholderMatch) {
      flushList();
      htmlParts.push(mermaidBlocks[parseInt(mermaidPlaceholderMatch[1], 10)]);
    } else if (chartPlaceholderMatch) {
      flushList();
      htmlParts.push(chartBlocks[parseInt(chartPlaceholderMatch[1], 10)]);
    } else if (cmmReportPlaceholderMatch) {
      flushList();
      htmlParts.push(cmmReportBlocks[parseInt(cmmReportPlaceholderMatch[1], 10)]);
    } else if (imagesPlaceholderMatch) {
      flushList();
      htmlParts.push(imageBlocks[parseInt(imagesPlaceholderMatch[1], 10)]);
    } else if (tablePlaceholderMatch) {
      flushList();
      htmlParts.push(tableBlocks[parseInt(tablePlaceholderMatch[1], 10)]);
    } else if (codePlaceholderMatch) {
      flushList();
      htmlParts.push(codeBlocks[parseInt(codePlaceholderMatch[1], 10)]);
    } else if (mathDisplayPlaceholderMatch) {
      flushList();
      htmlParts.push(mathDisplayBlocks[parseInt(mathDisplayPlaceholderMatch[1], 10)]);
    } else if (headingMatch) {
      flushList();
      const level = headingMatch[1].length; // 1, 2, or 3 '#' characters
      const content = headingMatch[2];
      if (content.length > 0) {
        htmlParts.push(`<h${level}>${content}</h${level}>`);
      }
    } else if (bulletMatch) {
      if (listType && listType !== "ul") flushList();
      listType = "ul";
      listBuffer.push(bulletMatch[1]);
    } else if (numberedMatch) {
      if (listType && listType !== "ol") flushList();
      listType = "ol";
      listBuffer.push(numberedMatch[1]);
    } else {
      flushList();
      if (line.length > 0) {
        htmlParts.push(`<p>${line}</p>`);
      }
    }
  }
  flushList();

  let html = htmlParts.join("");
  // **bold** -> <b>bold</b> (applied after line/list structure so it
  // works inside both plain paragraphs and list items)
  html = html.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");

  return html;
}



