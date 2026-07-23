import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import OpenAI from "openai";
import {
  getGoldPredictionToolDefinition,
  handleGoldPredictionCall,
} from "./goldPrediction.js";
import {
  performWebSearch,
  formatSearchResultsForModel,
  getWebSearchToolDefinition,
  handleWebSearchCall,
} from "./webSearch.js";
import { getLiveGoldPriceToolDefinition, handleLiveGoldPriceCall } from "./liveGoldPrice.js";
import {
  getGoldPriceHistoryToolDefinition,
  handleGoldPriceHistoryCall,
} from "./goldPriceHistory.js";
import { getOilPredictionToolDefinition, handleOilPredictionCall } from "./oilPrediction.js";
import { getLiveOilPriceToolDefinition, handleLiveOilPriceCall } from "./liveOilPrice.js";

const app = express();
app.use(cors());
app.use(express.json());
// Health check route (GET /) so we can verify the service is up
app.get("/", (req, res) => {
  res.send("✅ AI Chat backend is running successfully!");
});


const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ✅ Converts plain URLs into clickable HTML hyperlinks
function convertLinksToHTML(text) {
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
function formatMarkdownToHTML(text) {
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
    const headingMatch = line.match(/^(#{1,3})\s+(.*)/);
    const bulletMatch = line.match(/^[-*]\s+(.*)/);
    const numberedMatch = line.match(/^\d+\.\s+(.*)/);

    if (mermaidPlaceholderMatch) {
      flushList();
      htmlParts.push(mermaidBlocks[parseInt(mermaidPlaceholderMatch[1], 10)]);
    } else if (chartPlaceholderMatch) {
      flushList();
      htmlParts.push(chartBlocks[parseInt(chartPlaceholderMatch[1], 10)]);
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


// Static institutional knowledge
const instituteData = {
  founders:
    "The Institute of AI (iAi) was founded by Wael Albayaydh from the University of Oxford and Ivan Flechais from the University of Oxford.",
  mission:
    "At the Institute of AI, we are committed to advancing artificial intelligence by fostering strong connections with premier research institutions and technology companies. Our mission is to unlock AI's potential across all sectors by identifying, incubating, and transforming innovative AI projects into revenue-generating ventures.",
  vision:
    "Our vision is to lead the AI revolution by delivering transformative value and positioning the Institute as a world leader in AI innovation.",
  location:
    "The Institute of AI is headquartered in Oxfordshire, United Kingdom, with plans to open offices in San Francisco and other global locations.",
  services:
    "The Institute of AI provides expertise and support across multiple domains:\n- AI in Predictive Analytics\n- Fintech\n- Marketing\n- Automation\n- Robotics\n- Smart Homes\n- Cybersecurity\n- Agriculture\n- Education\n- Cryptography & Blockchain",
  about:
    "At the Institute of AI (iAi), we collaborate with research institutions and technology leaders to drive innovation in intelligent systems. The institute aims to secure funding, acquire profitable startups, and expand its global research and business impact. Learn more at https://www.institute-of-ai.org",
  website:
    " The website of the Institute of AI (iAi) is https://www.institute-of-ai.org",
  garnet:
    "**GARNET-26** (also called Garnet) is an AI chatbot developed and under ongoing training by the Institute of AI (iAi). It's designed to provide general assistance to users in a similar spirit to other AI chatbots such as ChatGPT, Gemini, or Claude -- answering questions, helping with information, and having natural conversations.\n\n" +
    "What sets GARNET-26 apart is a specialized focus: alongside general assistance, it studies commodity markets and works to generate the most accurate forecasts it can for future prices, using real historical data and statistical testing rather than guesswork -- currently covering **gold** and **crude oil (WTI)**.\n\n" +
    "## What it can do\n" +
    "**General assistance** -- explaining a concept, drafting or improving text, brainstorming ideas, or just having a conversation.\n\n" +
    "**Gold market:**\n" +
    "- Give a statistical prediction for gold's likely next-period direction and price -- e.g. \"What's your prediction for gold tomorrow?\"\n" +
    "- Report the current live gold price -- e.g. \"What's the gold price right now?\"\n" +
    "- Show a real chart of gold's recent price history -- e.g. \"Show me a chart of gold prices over the last 24 hours\"\n\n" +
    "**Oil market:**\n" +
    "- Give a statistical prediction for crude oil's (WTI) likely next-day direction and price -- e.g. \"What's your prediction for oil tomorrow?\"\n\n" +
    "**Both markets:**\n" +
    "- Explain what data and methodology its predictions are based on, honestly -- e.g. \"What data does your gold/oil prediction use, and how accurate is it?\"\n" +
    "- Search the web for current market news and context -- e.g. \"What's driving gold prices today?\" or \"What's happening in oil markets?\"\n\n" +
    "GARNET-26 always presents predictions as statistical estimates, not financial advice, and is upfront when a prediction hasn't shown a reliable edge over simply assuming prices stay the same. It's built and refined by the Institute of AI as part of the Institute's broader work in AI-driven predictive analytics.",
};

// (No custom gold-data routes needed anymore -- the chatbot fetches
// prediction and history data directly from the gold-predictor GitHub
// repo's raw URLs each time, inside handleGoldPredictionCall and
// handleGoldPriceHistoryCall.)

app.post("/chat", async (req, res) => {
  try {
    const { message, mode, history } = req.body;

    // Conversation history sent by the frontend: an array of
    // {role: "user"|"assistant", content: string} from prior turns in
    // this session. Capped to the last 20 messages (10 exchanges) to keep
    // token usage and latency bounded -- a chat widget doesn't need
    // unlimited memory, just enough to hold a real, coherent conversation.
    const MAX_HISTORY_MESSAGES = 20;
    const safeHistory = Array.isArray(history)
      ? history.slice(-MAX_HISTORY_MESSAGES).filter(
          (m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string"
        )
      : [];

    // Identify relevant topic
    const lower = message.toLowerCase();
    let answer = "";

    if (lower.includes("founder") || lower.includes("founded") || lower.includes("who started"))
      answer = instituteData.founders;
    else if (
      lower.includes("mission") ||
      lower.includes("goal") ||
      lower.includes("purpose")
    )
      answer = instituteData.mission;
    else if (lower.includes("vision"))
      answer = instituteData.vision;
    else if (
      lower.includes("location") ||
      lower.includes("where") ||
      lower.includes("office")
    )
      answer = instituteData.location;
    else if (lower.includes("garnet"))
      answer = instituteData.garnet;
    else if (
      lower.includes("service") ||
      lower.includes("offer") ||
      lower.includes("do you do")
    )
      answer = instituteData.services;
    else if (lower.includes("institute of ai") || lower.includes("iai"))
      answer = instituteData.about;
    else answer = "";

    // If no static match, fallback to OpenAI
    if (!answer) {
      // ✅ Real web search when the user selected "Web Search" mode.
      // Runs BEFORE the OpenAI call, injecting real, current search
      // results as context so GPT answers from actual retrieved
      // information instead of its own (possibly stale) training
      // knowledge. Degrades gracefully to normal chat behavior if the
      // search itself fails, rather than breaking the whole response.
      let searchContextMessage = null;
      if (mode === "web") {
        try {
          const searchData = await performWebSearch(message);
          const formatted = formatSearchResultsForModel(message, searchData);
          searchContextMessage = { role: "system", content: formatted };
        } catch (err) {
          console.error("Web search failed:", err.message);
          searchContextMessage = {
            role: "system",
            content:
              "Web search was requested but failed (technical error, not a content issue). " +
              "Tell the user the search is temporarily unavailable and offer to answer from general " +
              "knowledge instead, being clear that it may not be fully current.",
          };
        }
      }

      const messages = [
        {
          role: "system",
          content:
            "GOLD DATA/METHODOLOGY QUESTIONS -- READ THIS FIRST, HIGHEST PRIORITY RULE: if the user asks ANYTHING about the gold prediction system's data, history, methodology, accuracy, or how it works -- including loosely-phrased versions like 'what data do you use', 'how does this work', 'what's your data range', 'how far back does your data go', 'how many data points', 'is your prediction accurate', 'how accurate are you', 'what factors do you consider', 'prove it', 'verify your data', or ANY similar question -- you MUST call the get_gold_prediction function and answer using ONLY its real returned fields (historical_data_start_date, historical_data_end_date, data_points_used, model_accuracy_vs_baseline, is_statistically_significant, latest_news_sentiment_score, news_sentiment_currently_available). Do NOT answer these questions from general knowledge about how prediction systems typically work (e.g. do not say things like 'the system uses economic indicators and geopolitical events' or 'hundreds to thousands of data points' unless those exact words/numbers came from the tool's real output) -- if you have not called the tool in this turn, you do not yet have the real answer. This rule applies even if the question sounds general or the user doesn't explicitly say 'gold' -- if the topic is this system's own prediction data or methodology, always call the tool first. " +
            "You are a helpful assistant for the Institute of AI (iAi). When answering questions, use a professional tone and focus on the Institute's mission, founders, services, and goals. The Institute of AI's official website is exactly https://www.institute-of-ai.org -- always use this exact URL if you mention the website; never guess or use a different one. Format your responses using markdown-style formatting where it helps readability: **bold** for emphasis, and \"- \" at the start of a line for bullet points (one item per line) when listing multiple things. For longer or multi-part answers, structure them with headings: use a single \"# \" heading only for a genuine overall title (rare -- most answers don't need one), \"## \" for section headings dividing distinct topics within one answer, and \"### \" for sub-points within a section. Do NOT use headings for short, simple, conversational answers (a one- or two-sentence reply should just be plain text/paragraphs, not a heading) -- reserve headings for answers that genuinely have multiple distinct parts worth visually separating. " +
            "DIAGRAMS: when explaining a process, sequence of steps, hierarchy, decision flow, or relationship between things, you can include a diagram using Mermaid syntax in a fenced code block starting with ```mermaid and ending with ```. Use this ONLY when a visual structure genuinely aids understanding (a process with several steps, a decision tree, an org/hierarchy structure) -- NOT for simple factual answers or short conversational replies. Common Mermaid syntax: for a process flow, use \"flowchart TD\" (top-down) followed by lines like \"A[Step one] --> B[Step two]\"; for a decision with branches, use \"A{Decision?} -->|Yes| B[Outcome 1]\" and \"A -->|No| C[Outcome 2]\"; for a hierarchy, use \"A --> B\" and \"A --> C\" to show B and C as children of A. CRITICAL SYNTAX RULE (a confirmed real cause of rendering failures): if a node's label contains parentheses, chemical formulas, commas, colons, or any special character, you MUST wrap the entire label in double quotes, e.g. B[\"Glucose (C6H12O6)\"] not B[Glucose (C6H12O6)] -- the unquoted form breaks the parser. When in doubt, wrap ALL node labels in double quotes to be safe, and keep labels short and simple rather than descriptive. Keep diagrams simple (typically 4-8 nodes) and always include a brief text explanation alongside the diagram, not just the diagram alone. " +
            "PRICE CHARTS: when the user wants to SEE gold's recent price trend as a chart/graph/line diagram (e.g. 'draw a line chart of gold prices for the last 24 hours', 'show me how gold moved today', 'plot the last day's prices'), call the get_gold_price_history function first to get REAL data -- never fabricate price history from memory. Then present it using a fenced code block starting with ```chart and ending with ```, containing ONLY a single valid JSON object with this exact shape: {\"title\": \"Gold Price - Last 24 Hours (USD/oz)\", \"labels\": [\"Jul 22, 14:00\", \"Jul 22, 15:44\", ...], \"data\": [4126.93, 4131.53, ...]} -- labels and data must be the same length and in the same order as the real points returned by the function. This is a DIFFERENT tool and DIFFERENT block format from the prediction tool and the mermaid diagrams above -- do not mix them up, and do not use a ```chart block for anything other than real historical price data returned by get_gold_price_history. Always include a short sentence of text alongside the chart (e.g. the actual date range it covers, and a note that this is historical data, not a prediction). " +
            "If asked about gold prices generally (direction, forecast, current price), use the appropriate function (get_gold_prediction, get_live_gold_price, or search_web as described in each tool) -- and always state clearly that any prediction is a statistical estimate, not financial advice. " +
            "OIL PREDICTIONS: you (GARNET-26) have a SECOND, BUILT-IN prediction capability for crude oil (WTI), in addition to your gold prediction capability -- this is NOT a separate/external system, and you must NEVER say things like 'a separate oil prediction system is used' or offer to 'check the oil prediction system for' the user, as if it's not part of you. It IS part of you, just powered by a different underlying tool (get_oil_prediction) and a different dataset than gold, since oil and gold are different commodities with different real price histories -- the same way you might use different tools for different tasks, not different products. If asked about crude oil / WTI price direction, forecast, or the oil prediction system's methodology, call get_oil_prediction directly yourself, immediately, the same confident way you'd call get_gold_prediction for a gold question -- do not ask permission or offer to 'check' first. If the user wants the genuinely CURRENT oil price right now with no interest in a forecast, call get_live_oil_price instead (this is now patched into the prediction's own current_price_usd too, so the two should normally agree -- but if you're specifically asked for 'the current price' rather than a prediction, prefer get_live_oil_price for the freshest possible number). Like gold, always state any oil prediction is a statistical estimate, not financial advice, and be upfront if is_statistically_significant is false. " +
            "You have access to the recent conversation history -- use it naturally, e.g. resolve pronouns and follow-up questions ('what about next week', 'why', 'tell me more') using what was actually said earlier in this conversation, rather than treating every message as if it's the first one.",
        },
        ...(searchContextMessage ? [searchContextMessage] : []),
        ...safeHistory,
        { role: "user", content: message },
      ];

      // ✅ Give the model access to the gold prediction, web search, live
      // price, and (new) price history functions.
      const tools = [
        getGoldPredictionToolDefinition(),
        getWebSearchToolDefinition(),
        getLiveGoldPriceToolDefinition(),
        getGoldPriceHistoryToolDefinition(),
        getOilPredictionToolDefinition(),
        getLiveOilPriceToolDefinition(),
      ];

      let aiResponse = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages,
        tools,
      });

      let responseMessage = aiResponse.choices[0].message;

      // ✅ If the model decided to call get_gold_prediction, search_web,
      // get_live_gold_price, or (new) get_gold_price_history, run whichever
      // was requested and make a second call so the model can compose the
      // final answer using the real data.
      if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
        messages.push(responseMessage);

        for (const toolCall of responseMessage.tool_calls) {
          let toolResult;
          if (toolCall.function.name === "get_gold_prediction") {
            toolResult = await handleGoldPredictionCall(toolCall.function.arguments);
          } else if (toolCall.function.name === "search_web") {
            toolResult = await handleWebSearchCall(toolCall.function.arguments);
          } else if (toolCall.function.name === "get_live_gold_price") {
            toolResult = await handleLiveGoldPriceCall();
          } else if (toolCall.function.name === "get_gold_price_history") {
            toolResult = await handleGoldPriceHistoryCall(toolCall.function.arguments);
          } else if (toolCall.function.name === "get_oil_prediction") {
            toolResult = await handleOilPredictionCall();
          } else if (toolCall.function.name === "get_live_oil_price") {
            toolResult = await handleLiveOilPriceCall();
          } else {
            toolResult = JSON.stringify({ error: `Unknown tool: ${toolCall.function.name}` });
          }
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: toolResult,
          });
        }

        aiResponse = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages,
        });
        responseMessage = aiResponse.choices[0].message;
      }

      answer = responseMessage.content;
    }

    // ✅ Send formatted HTML reply (markdown structure converted, then
    // links made clickable) for display, PLUS the clean, unformatted
    // text as raw_reply -- the frontend should store raw_reply (not the
    // HTML version) in its conversation history, so future turns don't
    // feed GPT its own previously-rendered <p>/<ul> tags as context.
    res.json({
      reply: convertLinksToHTML(formatMarkdownToHTML(answer)),
      raw_reply: answer,
    });
  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({ reply: "⚠️ Server error. Please try again later." });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () =>
  console.log(`✅ AI Chat backend running with Institute of AI knowledge and link formatting`)
);
