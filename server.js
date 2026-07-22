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
  // Improved regex: avoids capturing trailing punctuation like ) , . etc.
  const urlRegex = /(https?:\/\/[^\s)>,]+)/g;
  return text.replace(urlRegex, '<a href="$1" target="_blank" style="color:#4ea3ff;text-decoration:underline;">$1</a>');
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
            "You are a helpful assistant for the Institute of AI (iAi). When answering questions, use a professional tone and focus on the Institute's mission, founders, services, and goals. Include hyperlinks when relevant. If asked about gold prices, use the get_gold_prediction function -- and always state clearly that this is a statistical estimate, not financial advice.",
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

    // ✅ Send formatted HTML reply (with clickable links)
    res.json({ reply: convertLinksToHTML(answer) });
  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({ reply: "⚠️ Server error. Please try again later." });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () =>
  console.log(`✅ AI Chat backend running with Institute of AI knowledge and link formatting`)
);
