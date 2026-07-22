import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import OpenAI from "openai";
import {
  getGoldPredictionToolDefinition,
  handleGoldPredictionCall,
} from "./goldPrediction.js";

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
// numbered lists, line breaks) into HTML the frontend can actually
// render, since the chat widget displays replies via innerHTML but GPT
// commonly defaults to markdown syntax (**bold**, "- item") unless the
// raw text is converted first -- markdown syntax on its own just shows
// up as literal asterisks/dashes in the chat, not real formatting.
function formatMarkdownToHTML(text) {
  if (!text) return text;

  const lines = text.split("\n");
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
    const bulletMatch = line.match(/^[-*]\s+(.*)/);
    const numberedMatch = line.match(/^\d+\.\s+(.*)/);

    if (bulletMatch) {
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
    "The Institute of AI provides expertise and support across multiple domains including AI in Predictive Analytics, Fintech, Marketing, Automation, Robotics, Smart Homes, Cybersecurity, Agriculture, Education, and Cryptography & Blockchain.",
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
    const { message, mode } = req.body;

    // Identify relevant topic
    const lower = message.toLowerCase();
    let answer = "";

    if (lower.includes("founder") || lower.includes("who started"))
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
      const messages = [
        {
          role: "system",
          content:
            "You are a helpful assistant for the Institute of AI (iAi). When answering questions, use a professional tone and focus on the Institute's mission, founders, services, and goals. The Institute of AI's official website is exactly https://www.institute-of-ai.org -- always use this exact URL if you mention the website; never guess or use a different one. Format your responses using markdown-style formatting where it helps readability: **bold** for emphasis, and \"- \" at the start of a line for bullet points (one item per line) when listing multiple things. If asked about gold prices, use the get_gold_prediction function -- and always state clearly that this is a statistical estimate, not financial advice.",
        },
        { role: "user", content: message },
      ];

      // ✅ NEW: give the model access to the gold prediction function
      const tools = [getGoldPredictionToolDefinition()];

      let aiResponse = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages,
        tools,
      });

      let responseMessage = aiResponse.choices[0].message;

      // ✅ NEW: if the model decided to call get_gold_prediction, run it
      // and make a second call so the model can compose the final answer
      // using the real prediction data.
      if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
        messages.push(responseMessage);

        for (const toolCall of responseMessage.tool_calls) {
          if (toolCall.function.name === "get_gold_prediction") {
            const toolResult = await handleGoldPredictionCall(toolCall.function.arguments);
            messages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: toolResult,
            });
          }
        }

        aiResponse = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages,
        });
        responseMessage = aiResponse.choices[0].message;
      }

      answer = responseMessage.content;
    }

    // ✅ Send formatted HTML reply (markdown structure converted, then links made clickable)
    res.json({ reply: convertLinksToHTML(formatMarkdownToHTML(answer)) });
  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({ reply: "⚠️ Server error. Please try again later." });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () =>
  console.log(`✅ AI Chat backend running with Institute of AI knowledge and link formatting`)
);
