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
// numbered lists, line breaks, and now ```mermaid fenced diagram blocks)
// into HTML the frontend can actually render, since the chat widget
// displays replies via innerHTML but GPT commonly defaults to markdown
// syntax unless the raw text is converted first.
function formatMarkdownToHTML(text) {
  if (!text) return text;

  // Extract ```mermaid ... ``` fenced blocks FIRST, before any line-by-line
  // processing touches them -- Mermaid diagram syntax spans multiple lines
  // with its own internal structure (arrows, node definitions, etc.) that
  // would be corrupted if run through the paragraph/heading/list logic
  // below. Replaced with placeholder tokens, restored after everything
  // else is processed.
  const mermaidBlocks = [];
  const textWithPlaceholders = text.replace(
    /```mermaid\s*\n([\s\S]*?)```/g,
    (match, diagramCode) => {
      const placeholder = `@@MERMAID_BLOCK_${mermaidBlocks.length}@@`;
      // The frontend looks for elements with class="mermaid" and renders
      // them via the Mermaid.js library loaded on the page.
      mermaidBlocks.push(`<div class="mermaid">${diagramCode.trim()}</div>`);
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
    const headingMatch = line.match(/^(#{1,3})\s+(.*)/);
    const bulletMatch = line.match(/^[-*]\s+(.*)/);
    const numberedMatch = line.match(/^\d+\.\s+(.*)/);

    if (mermaidPlaceholderMatch) {
      flushList();
      htmlParts.push(mermaidBlocks[parseInt(mermaidPlaceholderMatch[1], 10)]);
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
};

// (No custom gold-data routes needed anymore -- the chatbot fetches
// prediction data directly from the gold-predictor GitHub repo's raw
// URL each time, inside handleGoldPredictionCall.)

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
      // ✅ NEW: real web search when the user selected "Web Search" mode.
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
            "You are a helpful assistant for the Institute of AI (iAi). When answering questions, use a professional tone and focus on the Institute's mission, founders, services, and goals. The Institute of AI's official website is exactly https://www.institute-of-ai.org -- always use this exact URL if you mention the website; never guess or use a different one. Format your responses using markdown-style formatting where it helps readability: **bold** for emphasis, and \"- \" at the start of a line for bullet points (one item per line) when listing multiple things. For longer or multi-part answers, structure them with headings: use a single \"# \" heading only for a genuine overall title (rare -- most answers don't need one), \"## \" for section headings dividing distinct topics within one answer, and \"### \" for sub-points within a section. Do NOT use headings for short, simple, conversational answers (a one- or two-sentence reply should just be plain text/paragraphs, not a heading) -- reserve headings for answers that genuinely have multiple distinct parts worth visually separating. " +
            "DIAGRAMS: when explaining a process, sequence of steps, hierarchy, decision flow, or relationship between things, you can include a diagram using Mermaid syntax in a fenced code block starting with ```mermaid and ending with ```. Use this ONLY when a visual structure genuinely aids understanding (a process with several steps, a decision tree, an org/hierarchy structure) -- NOT for simple factual answers or short conversational replies. Common Mermaid syntax: for a process flow, use \"flowchart TD\" (top-down) followed by lines like \"A[Step one] --> B[Step two]\"; for a decision with branches, use \"A{Decision?} -->|Yes| B[Outcome 1]\" and \"A -->|No| C[Outcome 2]\"; for a hierarchy, use \"A --> B\" and \"A --> C\" to show B and C as children of A. CRITICAL SYNTAX RULE (a confirmed real cause of rendering failures): if a node's label contains parentheses, chemical formulas, commas, colons, or any special character, you MUST wrap the entire label in double quotes, e.g. B[\"Glucose (C6H12O6)\"] not B[Glucose (C6H12O6)] -- the unquoted form breaks the parser. When in doubt, wrap ALL node labels in double quotes to be safe, and keep labels short and simple rather than descriptive. Keep diagrams simple (typically 4-8 nodes) and always include a brief text explanation alongside the diagram, not just the diagram alone. " +
            "If asked about gold prices, use the get_gold_prediction function -- and always state clearly that this is a statistical estimate, not financial advice. You have access to the recent conversation history -- use it naturally, e.g. resolve pronouns and follow-up questions ('what about next week', 'why', 'tell me more') using what was actually said earlier in this conversation, rather than treating every message as if it's the first one.",
        },
        ...(searchContextMessage ? [searchContextMessage] : []),
        ...safeHistory,
        { role: "user", content: message },
      ];

      // ✅ NEW: give the model access to the gold prediction function
      const tools = [getGoldPredictionToolDefinition(), getWebSearchToolDefinition()];

      let aiResponse = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages,
        tools,
      });

      let responseMessage = aiResponse.choices[0].message;

      // ✅ NEW: if the model decided to call get_gold_prediction or
      // search_web, run whichever was requested and make a second call
      // so the model can compose the final answer using the real data.
      if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
        messages.push(responseMessage);

        for (const toolCall of responseMessage.tool_calls) {
          let toolResult;
          if (toolCall.function.name === "get_gold_prediction") {
            toolResult = await handleGoldPredictionCall(toolCall.function.arguments);
          } else if (toolCall.function.name === "search_web") {
            toolResult = await handleWebSearchCall(toolCall.function.arguments);
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
