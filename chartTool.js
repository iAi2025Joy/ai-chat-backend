// chartTool.js
//
// The render_chart tool: line/bar/pie charts and 2-3 set Venn diagrams.
// Split out of server.js as its own module -- every piece of chart
// validation, sanitization, and rendering logic lives here and only
// here, so a future change to chart behavior (a new chart type, a new
// validation rule, a new visual option) can be made and reasoned about
// entirely within this one file, with zero risk of accidentally
// affecting prediction tools, document handling, transcription, or any
// other unrelated service in server.js. Only getRenderChartToolDefinition
// and handleRenderChartCall are exported -- everything else here
// (buildChartDivHtml, computeVennRegions, buildVennDivHtml,
// handleVennChartCall, sanitizeChartValues, reconcileChartLengths) is a
// private internal helper, not part of this module's public surface.

// Builds the exact <div class="price-chart" data-chart="..."> HTML the
// frontend's Chart.js renderer looks for -- shared by both the legacy
// ```chart fenced-block path in formatMarkdownToHTML below (kept as a
// harmless fallback in case GPT still writes one) AND the new
// render_chart TOOL (see getRenderChartToolDefinition below), which is
// now the primary, recommended way to produce a chart.
function buildChartDivHtml(chartObj) {
  const safeJson = JSON.stringify(chartObj)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<div class="price-chart" data-chart="${safeJson}"><canvas></canvas></div>`;
}

// ------------------------------------------------------------------
// RENDER_CHART TOOL -- a confirmed real bug this fixes: asked to show a
// bar or pie chart of real data it had already gathered, GPT wrote
// prose ANNOUNCING a chart ("Here's how this can be visualized in a pie
// chart format:") and then never actually included a valid ```chart
// fenced block at all -- the same category of prose-compliance failure
// that's shown up repeatedly elsewhere in this project (market-closed
// statements, etc.), just in a new spot. Hand-authoring a perfectly-
// formed JSON blob inside an exact fenced-code-block syntax, correctly,
// every single time, turned out not to be reliable. This tool sidesteps
// that entirely: GPT calls it with plain structured arguments (far
// simpler for a model to get right than freeform fenced-block text),
// and the SERVER builds the actual chart HTML directly in code (see
// buildChartDivHtml above) and appends it to the final answer itself --
// removing GPT's own text formatting from the chart-rendering step
// completely, the same "capture it from real tool output, apply it in
// code" pattern already used for the market-closed statement fix.
// ------------------------------------------------------------------

export function getRenderChartToolDefinition() {
  return {
    type: "function",
    function: {
      name: "render_chart",
      description:
        "Render a real chart or diagram for the user using data you actually have -- from a tool result (get_gold_price_history, search_web, fetch_web_page) or genuinely well-known facts. This DIRECTLY renders it for the user automatically -- do NOT also try to write a ```chart fenced code block or repeat the raw data yourself; just call this function, then continue your response normally (a short sentence of context is enough -- the visual appears automatically, you don't need to describe how it could be visualized, just render it). Use 'line' for a trend over time (e.g. price history), 'bar' for comparing several items, 'pie' for parts of a whole/percentages that add up to ~100%, 'venn' for showing overlap between 2 or 3 groups/categories (e.g. 'countries that speak French vs Spanish vs both', 'skills shared between two job roles'). For 'venn', use the 'sets' parameter instead of labels/data -- give each set's label and its actual real members as a list of strings; the overlaps are computed automatically from what's actually shared between the lists, don't calculate overlap counts yourself. MULTIPLE BARS/LINES PER CATEGORY (e.g. comparing Revenue AND Net Profit for each year, side by side): use the 'series' parameter instead of 'data' -- one entry per metric, each with its own name and full array of values (still aligned to the same 'labels' array). Do NOT try to fake multiple bars per label by only using 'data' -- 'data' is a single series and can only ever produce ONE bar/point per label; 'series' is required any time the user asks for more than one bar, line, or value per category. NEVER invent or estimate numbers/items just to have something to chart -- only call this with real data.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Short chart title, e.g. 'Educational Attainment in Jordan (%)'." },
          type: { type: "string", enum: ["line", "bar", "pie", "venn"], description: "Visualization type." },
          labels: {
            type: "array",
            items: { type: "string" },
            description: "For line/bar/pie only: category/x-axis labels, e.g. ['Primary', 'Secondary', 'Tertiary'] or dates for a line chart. Must be the same length as data (or as each series' data, if using 'series'). Not used for 'venn' -- use 'sets' instead.",
          },
          data: {
            type: "array",
            items: { type: "number" },
            description: "For a SINGLE series only (one bar/point per label) on line/bar/pie -- the real numeric values, same order and same length as labels. If you need more than one bar/line per label (e.g. comparing multiple metrics side by side), use 'series' instead of this. Not used for 'venn' -- use 'sets' instead. Not used for pie combined with 'series' -- pie only ever has one series.",
          },
          series: {
            type: "array",
            description: "For 'line' or 'bar' ONLY, when comparing MORE THAN ONE metric per label (e.g. Revenue and Net Profit for each year, shown as multiple bars per year, or multiple lines over time). Each entry is one full series -- do not use together with 'data'; use one or the other. Ignored for 'pie'/'venn'.",
            items: {
              type: "object",
              properties: {
                name: { type: "string", description: "This series' name, e.g. 'Revenue' or 'Net Profit' -- shown in the chart legend." },
                data: {
                  type: "array",
                  items: { type: "number" },
                  description: "This series' real numeric values, same order and same length as 'labels'.",
                },
              },
              required: ["name", "data"],
            },
          },
          yAxisLabel: { type: "string", description: "Optional y-axis label for line/bar charts, e.g. 'USD/oz' or 'Percent'. Omit for pie/venn." },
          threeD: {
            type: "boolean",
            description: "For type 'bar' ONLY. Set true only when the user explicitly asks for a 3D / 3-dimensional bar chart -- renders each bar with a shaded top and side face for a real extruded 3D look, instead of a normal flat bar. Defaults to false (normal flat bars) otherwise -- do not set this unless 3D was actually requested. Ignored for line/pie/venn.",
          },
          pieSliceLabels: {
            type: "boolean",
            description: "For type 'pie' ONLY. Set true only when the user explicitly asks to show each slice's value/number, or to add arrows/labels pointing to each slice. Draws a leader-line arrow from each slice to its real value and percentage of the total. Defaults to false (a normal plain pie chart with just a legend) otherwise -- do not set this unless it was actually requested. Ignored for line/bar/venn.",
          },
          sets: {
            type: "array",
            description: "REQUIRED for type 'venn' only, ignored otherwise. Exactly 2 or 3 sets to compare.",
            items: {
              type: "object",
              properties: {
                label: { type: "string", description: "This set's name, e.g. 'French-speaking countries'." },
                items: {
                  type: "array",
                  items: { type: "string" },
                  description: "The real, actual members of this set, e.g. ['France', 'Senegal', 'Canada']. Overlaps with other sets are computed automatically by matching identical strings (case-insensitive) -- keep naming consistent across sets (e.g. always 'USA', not 'USA' in one set and 'United States' in another) so real overlaps are actually detected.",
                },
              },
              required: ["label", "items"],
            },
          },
        },
        required: ["title", "type"],
      },
    },
  };
}

// Computes REAL set overlaps for a Venn diagram -- given 2 or 3 sets of
// actual items (strings), returns which items are unique to each set and
// which are shared, matched case-insensitively (so "USA" in one set and
// "usa" in another are correctly recognized as the same real item).
// Deliberately done in CODE, not left to the model to calculate itself --
// counting real overlaps between lists is exactly the kind of mechanical
// task a model can get subtly wrong (miscounting, missing a case-
// variant match), and a wrong Venn diagram would misrepresent real data.
function computeVennRegions(sets) {
  const normalized = sets.map((s) => {
    const map = new Map(); // normalized (lowercase/trimmed) -> original display casing, first occurrence wins
    for (const item of s.items) {
      const norm = String(item).trim().toLowerCase();
      if (norm && !map.has(norm)) map.set(norm, String(item).trim());
    }
    return { label: s.label, map };
  });

  if (normalized.length === 2) {
    const [A, B] = normalized;
    const onlyA = [...A.map.keys()].filter((k) => !B.map.has(k)).map((k) => A.map.get(k));
    const onlyB = [...B.map.keys()].filter((k) => !A.map.has(k)).map((k) => B.map.get(k));
    const both = [...A.map.keys()].filter((k) => B.map.has(k)).map((k) => A.map.get(k));
    return { setCount: 2, labels: [A.label, B.label], regions: { onlyA, onlyB, both } };
  }

  if (normalized.length === 3) {
    const [A, B, C] = normalized;
    const allKeys = new Set([...A.map.keys(), ...B.map.keys(), ...C.map.keys()]);
    const onlyA = [], onlyB = [], onlyC = [], AB = [], AC = [], BC = [], ABC = [];
    for (const k of allKeys) {
      const a = A.map.has(k), b = B.map.has(k), c = C.map.has(k);
      const display = A.map.get(k) || B.map.get(k) || C.map.get(k);
      if (a && b && c) ABC.push(display);
      else if (a && b) AB.push(display);
      else if (a && c) AC.push(display);
      else if (b && c) BC.push(display);
      else if (a) onlyA.push(display);
      else if (b) onlyB.push(display);
      else onlyC.push(display);
    }
    return { setCount: 3, labels: [A.label, B.label, C.label], regions: { onlyA, onlyB, onlyC, AB, AC, BC, ABC } };
  }

  return null;
}

// Builds the <div class="venn-chart" data-venn="..."> marker the frontend
// looks for and renders as an actual SVG Venn diagram -- same
// "backend validates and prepares real data, frontend draws it" split as
// buildChartDivHtml above, just a different element/renderer since a
// Venn diagram isn't a Chart.js chart type at all.
function buildVennDivHtml(title, vennResult) {
  const payload = { title, ...vennResult };
  const safeJson = JSON.stringify(payload)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<div class="venn-chart" data-venn="${safeJson}"></div>`;
}

function handleVennChartCall(args) {
  const { title, sets } = args;
  if (!Array.isArray(sets) || (sets.length !== 2 && sets.length !== 3)) {
    console.error("render_chart (venn): validation failed -- sets must be an array of exactly 2 or 3 items.", "raw args:", JSON.stringify(args));
    return {
      toolResult: JSON.stringify({ error: "For type 'venn', sets must be an array of exactly 2 or 3 {label, items} objects." }),
      chartHtml: null,
    };
  }
  for (const s of sets) {
    if (!s || typeof s.label !== "string" || !Array.isArray(s.items) || s.items.length === 0) {
      console.error("render_chart (venn): validation failed -- each set needs a label and non-empty items array.", "raw args:", JSON.stringify(args));
      return {
        toolResult: JSON.stringify({ error: "Each set needs a 'label' string and a non-empty 'items' array." }),
        chartHtml: null,
      };
    }
  }

  const vennResult = computeVennRegions(sets);
  const chartHtml = buildVennDivHtml(title || "", vennResult);

  console.log(`render_chart (venn): SUCCESS. setCount=${vennResult.setCount}, title=${JSON.stringify(title || "")}`);

  return {
    toolResult: JSON.stringify({
      success: true,
      note: "Venn diagram created and will be shown to the user automatically. Do not repeat the overlap data yourself in a list -- the computed_regions below are the REAL overlaps if you want to reference specific shared/unique items in your own text, just continue your response normally otherwise.",
      computed_regions: vennResult.regions,
    }),
    chartHtml,
  };
}

// Sanitizes and validates ONE array of chart values -- shared by both
// the single-series ('data') and multi-series ('series[].data') paths
// below so they can't drift into different validation behavior. Same
// fix as before: strips $, commas, and whitespace before parsing, then
// confirms every value is a real finite number, returning which
// specific indexes failed (if any) so the caller can build a clear
// error message rather than silently shipping invisible bars.
function sanitizeChartValues(values) {
  const sanitized = values.map((v) => {
    if (typeof v === "number") return v;
    const cleaned = String(v).replace(/[$,\s]/g, "");
    return Number(cleaned);
  });
  const badIndexes = sanitized
    .map((v, i) => (Number.isFinite(v) ? null : i))
    .filter((i) => i !== null);
  return { sanitized, badIndexes };
}

// Reconciles a labels array against one or more same-length data arrays
// -- generalizes the earlier single-series off-by-one auto-correct (see
// its own original comment history) to cover any number of arrays at
// once, since multi-series charts need every series to end up the SAME
// final length as labels, not each independently truncated to a
// possibly different length. Returns { finalLen, error }; error is null
// on success.
function reconcileChartLengths(labelsLength, dataLengths) {
  const allLengths = [labelsLength, ...dataLengths];
  const minLen = Math.min(...allLengths);
  const maxLen = Math.max(...allLengths);
  if (minLen === 0) return { finalLen: 0, error: "labels and data must all be non-empty arrays." };
  if (maxLen - minLen > 2) {
    return {
      finalLen: 0,
      error: `labels and data (or every series' data) must be arrays of the same length -- got lengths ${allLengths.join(", ")}.`,
    };
  }
  return { finalLen: minLen, error: null };
}

export function handleRenderChartCall(argsJson) {
  let args = {};
  try {
    args = argsJson ? JSON.parse(argsJson) : {};
  } catch (err) {
    console.error("render_chart: could not parse arguments JSON:", err.message, "raw:", argsJson);
    return { toolResult: JSON.stringify({ error: "Could not parse chart arguments." }), chartHtml: null };
  }

  // Tolerate minor variations GPT might send despite the strict enum
  // (e.g. "Bar", "bar chart", trailing/leading whitespace) rather than
  // failing validation on something trivially fixable.
  let type = (args.type || "").toString().trim().toLowerCase().replace(/\s*chart$/, "");

  if (type === "venn") {
    return handleVennChartCall(args);
  }

  if (!["line", "bar", "pie"].includes(type)) {
    console.error("render_chart: invalid type.", "received type:", JSON.stringify(args.type), "raw args:", JSON.stringify(args));
    return { toolResult: JSON.stringify({ error: "type must be 'line', 'bar', or 'pie'." }), chartHtml: null };
  }

  const { title, labels, data, series, yAxisLabel, threeD, pieSliceLabels } = args;

  if (!Array.isArray(labels) || labels.length === 0) {
    console.error("render_chart: validation failed (missing/empty labels).", "raw args:", JSON.stringify(args));
    return { toolResult: JSON.stringify({ error: "labels must be a non-empty array." }), chartHtml: null };
  }

  // MULTI-SERIES PATH -- a confirmed real bug this fixes: asked for
  // multiple bars per category (e.g. Revenue AND Net Profit per year,
  // shown side by side), GPT's text claimed multiple bars but the chart
  // only ever showed ONE bar per year -- because the tool had no field
  // that could carry more than one value per label at all. 'series' is
  // that field: each entry is validated and sanitized the same way the
  // old single 'data' array was, just once per series.
  if (Array.isArray(series) && series.length > 0) {
    if (type === "pie") {
      console.error("render_chart: 'series' is not supported for type 'pie'.", "raw args:", JSON.stringify(args));
      return {
        toolResult: JSON.stringify({ error: "'series' (multiple datasets) is only supported for 'line' and 'bar', not 'pie' -- a pie chart is always a single series. Use 'data' for a pie chart instead." }),
        chartHtml: null,
      };
    }
    for (const s of series) {
      if (!s || typeof s.name !== "string" || !Array.isArray(s.data)) {
        console.error("render_chart: validation failed -- each series needs a 'name' string and a 'data' array.", "raw args:", JSON.stringify(args));
        return {
          toolResult: JSON.stringify({ error: "Each entry in 'series' needs a 'name' string and a 'data' array." }),
          chartHtml: null,
        };
      }
    }

    const { finalLen, error: lenError } = reconcileChartLengths(labels.length, series.map((s) => s.data.length));
    if (lenError) {
      console.error("render_chart: series length reconciliation failed.", lenError, "raw args:", JSON.stringify(args));
      return { toolResult: JSON.stringify({ error: lenError }), chartHtml: null };
    }

    const finalLabels = labels.slice(0, finalLen);
    const finalSeries = [];
    for (const s of series) {
      const { sanitized, badIndexes } = sanitizeChartValues(s.data.slice(0, finalLen));
      if (badIndexes.length > 0) {
        console.error(
          `render_chart: validation failed (non-numeric values in series "${s.name}").`,
          "bad indexes:", badIndexes,
          "raw args:", JSON.stringify(args)
        );
        return {
          toolResult: JSON.stringify({
            error: `Series "${s.name}" contains values that aren't real numbers: ${badIndexes.map((i) => JSON.stringify(s.data[i])).join(", ")}. Call render_chart again with plain numeric values in every series (no currency symbols, no thousands separators).`,
          }),
          chartHtml: null,
        };
      }
      finalSeries.push({ name: s.name, data: sanitized });
    }

    const chartHtml = buildChartDivHtml({
      title: title || "",
      type,
      labels: finalLabels,
      series: finalSeries,
      yAxisLabel: yAxisLabel || undefined,
      threeD: type === "bar" ? !!threeD : undefined,
    });

    console.log(
      `render_chart: SUCCESS (multi-series). type=${type}, seriesCount=${finalSeries.length}, points=${finalLabels.length}, title=${JSON.stringify(title || "")}, chartHtml_length=${chartHtml.length}`
    );

    return {
      toolResult: JSON.stringify({
        success: true,
        note: "Multi-series chart created and will be shown to the user automatically. Do not also write a ```chart block or repeat this data yourself -- just continue your response normally.",
      }),
      chartHtml,
    };
  }

  // SINGLE-SERIES PATH (legacy 'data' array, one bar/point per label).
  if (!Array.isArray(data) || data.length === 0) {
    console.error(
      "render_chart: validation failed (missing/empty data, and no 'series' provided).",
      "data:", Array.isArray(data) ? data.length : typeof data,
      "raw args:", JSON.stringify(args)
    );
    return {
      toolResult: JSON.stringify({ error: "data must be a non-empty array (or use 'series' for multiple datasets)." }),
      chartHtml: null,
    };
  }

  const { finalLen, error: lenError } = reconcileChartLengths(labels.length, [data.length]);
  if (lenError) {
    console.error("render_chart: length reconciliation failed.", lenError, "raw args:", JSON.stringify(args));
    return { toolResult: JSON.stringify({ error: lenError }), chartHtml: null };
  }
  const finalLabels = labels.slice(0, finalLen);
  const finalData = data.slice(0, finalLen);

  // A confirmed real bug this fixes: the tool's JSON schema declares
  // `data` as an array of numbers, but that's not strictly enforced on
  // the OpenAI side (this project doesn't use strict-mode schemas) --
  // GPT can and does sometimes send numbers formatted as strings with
  // commas ("1,943.20") or a currency symbol ("$1900"). The old code
  // ran these straight through `Number(...)` with no validation at all,
  // silently producing NaN. Chart.js then draws the axis normally (it
  // only needs the labels/scale config) but skips any bar/point whose
  // value is NaN -- the exact "axis shows, no data plotted" symptom
  // reported, with zero error anywhere since nothing ever checked for
  // it. Each value is now sanitized (stripping $, commas, and
  // whitespace) before parsing, then validated as a real finite number
  // -- if any value is still invalid after that, the call fails with a
  // clear error telling GPT which value was bad, so it can retry with
  // corrected data instead of silently shipping a chart with invisible
  // bars.
  const { sanitized: sanitizedData, badIndexes } = sanitizeChartValues(finalData);
  if (badIndexes.length > 0) {
    console.error(
      "render_chart: validation failed (non-numeric data values after sanitizing).",
      "bad indexes:", badIndexes,
      "raw values at those indexes:", badIndexes.map((i) => finalData[i]),
      "raw args:", JSON.stringify(args)
    );
    return {
      toolResult: JSON.stringify({
        error: `data must contain only real numbers -- these values could not be parsed as numbers: ${badIndexes.map((i) => JSON.stringify(finalData[i])).join(", ")}. Call render_chart again with plain numeric values (no currency symbols, no thousands separators).`,
      }),
      chartHtml: null,
    };
  }

  const chartHtml = buildChartDivHtml({
    title: title || "",
    type,
    labels: finalLabels,
    data: sanitizedData,
    yAxisLabel: yAxisLabel || undefined,
    threeD: type === "bar" ? !!threeD : undefined,
    pieSliceLabels: type === "pie" ? !!pieSliceLabels : undefined,
  });

  // A confirmed real gap this fixes: only failure paths were logged
  // before, so a fully successful call (matching label/data lengths,
  // valid type) produced ZERO log output -- making it impossible to
  // distinguish "render_chart was never called" from "it was called and
  // actually succeeded" just by looking at the Render logs, which is
  // exactly the ambiguity that came up while debugging a real report of
  // the chart still not appearing despite no error being logged.
  console.log(
    `render_chart: SUCCESS. type=${type}, points=${finalLabels.length}, title=${JSON.stringify(title || "")}, chartHtml_length=${chartHtml.length}`
  );

  return {
    toolResult: JSON.stringify({
      success: true,
      note: "Chart created and will be shown to the user automatically. Do not also write a ```chart block or repeat this data yourself -- just continue your response normally.",
    }),
    chartHtml,
  };
}
