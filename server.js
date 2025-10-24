// server.js
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import fetch from "node-fetch";

const app = express();

// --- CORS: allow your site + local dev
app.use(cors({
  origin: [
    "https://www.institute-of-ai.org",
    "https://institute-of-ai.org",
    "http://localhost:5500",
    "http://localhost:3000"
  ],
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(bodyParser.json());

// ---- Environment
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

// ---- Institute of AI knowledge base (private, server-side)
const institute = {
  summary:
`🏛️ Institute of AI (iAi)
The Institute of AI is a research and innovation organization dedicated to advancing artificial intelligence through global collaboration, innovation, and startup incubation. It was founded by researchers from the University of Oxford.`,

  founders:
`👨‍🔬 Founders
The Institute of AI was founded by Dr. Wael Albayaydh and Dr. Ivan Flechais from the University of Oxford.`,

  location:
`📍 Location
The Institute of AI (iAi) is headquartered in Oxfordshire, United Kingdom, with plans to open offices in San Francisco and other strategic locations around the world.`,

  mission:
`🎯 Mission
To unlock AI’s potential across all sectors by identifying, incubating, and transforming innovative projects into sustainable, revenue-generating ventures; bridging academia and industry.`,

  vision:
`🌍 Vision
To become a world leader in AI innovation, achieve unicorn status within five years, and establish a strong global presence within three years through responsible, collaborative AI.`,

  services:
`💡 Services & Areas of Focus
- Predictive Analytics
- AI in Marketing
- AI in Fintech
- AI for Automation
- Robotics
- Smart Homes
- Cybersecurity
- Agriculture
- Education
- Cryptography & Blockchain`,

  funding:
`💰 Funding
The Institute of AI aims to raise investment to expand research capabilities and business impact, accelerate innovation, and support global collaborations.`,

  chatbot:
`🤖 About this Chatbot
This chatbot was created by the Institute of AI to provide information about the institute and demonstrate conversational AI capabilities.`
};

// ---- Simple intent router: reply only the part asked for
function routeInstituteQuestion(text) {
  const q = (text || "").toLowerCase();

  // founders
  if (q.includes("founder") || q.includes("who created") || q.includes("who started"))
    return institute.founders;

  // location / offices
  if (q.includes("where") || q.includes("located") || q.includes("location")
   || q.includes("office") || q.includes("headquarter") || q.includes("oxford")
   || q.includes("oxfordshire") || q.includes("san francisco") || q.includes("united kingdom"))
    return institute.location;

  // mission
  if (q.includes("mission") || q.includes("goal") || q.includes("objectives"))
    return institute.mission;

  // vision
  if (q.includes("vision") || q.includes("aspiration"))
    return institute.vision;

  // services / areas
  if (q.includes("service") || q.includes("what do you do")
   || q.includes("focus") || q.includes("area") || q.includes("capabilities"))
    return institute.services;

  // funding
  if (q.includes("fund") || q.includes("investment") || q.includes("raise"))
    return institute.funding;

  // chatbot
  if (q.includes("chatbot") || q.includes("this chat"))
    return institute.chatbot;

  // general “what is iAi” style
  if (q.includes("institute of ai") || q.includes("iai") || q.includes("what is"))
    return institute.summary;

  return null; // let OpenAI handle other topics
}

// ---- Health check
app.get("/healthz", (req, res) => {
  res.json({ ok: true, model: OPENAI_MODEL || "unset" });
});

// ---- Chat endpoint
app.post("/chat", async (req, res) => {
  try {
    const message = req.body?.message || "";

    // 1) If question is about the institute, answer locally (specific piece only)
    const kbAnswer = routeInstituteQuestion(message);
    if (kbAnswer) {
      return res.json({ reply: kbAnswer });
    }

    // 2) Otherwise, forward to OpenAI (requires env var OPENAI_API_KEY)
    if (!OPENAI_API_KEY) {
      return res.status(500).json({
        reply: "⚠️ Server is missing OPENAI_API_KEY. Please configure the backend."
      });
    }

    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          { role: "system", content: "You are a helpful assistant." },
          { role: "user", content: message }
        ],
        temperature: 0.6
      })
    });

    const data = await openaiRes.json();
    const reply = data?.choices?.[0]?.message?.content || "No response.";
    res.json({ reply });

  } catch (err) {
    console.error("Chat error:", err);
    res.status(500).json({ reply: "⚠️ Server error. Please try again later." });
  }
});

// ---- Start server (Render uses process.env.PORT)
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`✅ AI Chat backend running on port ${PORT}`);
});
