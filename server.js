// server.js
import express from "express";
import cors from "cors";
import OpenAI from "openai";

const app = express();
app.use(cors());
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const PORT = process.env.PORT || 10000;
const TAVILY_API_KEY = process.env.TAVILY_API_KEY;

// ====== Knowledge base about the Institute of AI ======
const INSTITUTE_KB = `
You are the official assistant of the Institute of AI (iAi).

Website: https://www.institute-of-ai.org

About:
The Institute of AI (iAi) is a research and innovation organization focused on advancing artificial intelligence through global collaboration, innovation, and startup incubation. It was founded by Wael Albayaydh and Ivan Flechais from the University of Oxford.

Mission:
At the Institute of AI, we are committed to unlocking AI's potential across all sectors by identifying, incubating, and transforming innovative AI projects into revenue-generating ventures. We collaborate with global institutions and technology leaders to drive innovation and shape the future of intelligent technologies.

Vision:
To lead the AI revolution by delivering transformative value, fostering innovation, and positioning the Institute of AI as a global leader in intelligent systems research and commercialization.

Location:
The Institute of AI is headquartered in Oxfordshire, United Kingdom, with plans to open offices in San Francisco and other international locations.

Services:
The Institute of AI provides expertise and support in multiple domains:
- AI in Predictive Analytics
- AI in Marketing
- AI in Fintech
- AI for Automation
- Robotics
- Smart Homes
- AI in Cybersecurity
- AI in Agriculture
- AI in Education
- AI in Cryptography & Blockchain
`;

// ====== Knowledge-based mode ======
async function answerFromInstituteKB(userMessage) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content: INSTITUTE_KB,
      },
      {
        role: "user",
        content: userMessage,
      },
    ],
  });
  return completion.choices[0]?.message?.content?.trim() || "I couldn't generate a response.";
}

// ====== Tavily web search mode ======
async function tavilySearch(query) {
  if (!TAVILY_API_KEY) return { answer: null, results: [] };

  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: TAVILY_API_KEY,
      query,
      search_depth: "advanced",
      max_results: 5,
      include_answer: true,
    }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Tavily API error: ${res.status} ${txt}`);
  }

  return res.json();
}

function formatSources(results = []) {
  const top = results.slice(0, 3);
  if (!top.length) return "";
  const lines = top.map((r, i) => `[${i + 1}] ${r.title || r.url} — ${r.url}`);
  return `\n\nSources:\n${lines.join("\n")}`;
}

async function answerFromWeb(userMessage) {
  const search = await tavilySearch(userMessage);

  const snippets =
    (search.answer && typeof search.answer === "string" ? search.answer : "") ||
    (search.results && search.results.length
      ? search.results.map(r => `• ${r.title || r.url}: ${r.content?.slice(0, 260) || ""}`).join("\n")
      : "");

  if (!snippets) return "No relevant web search results were found for your query.";

  const aiResponse = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.3,
    messages: [
      {
        role: "system",
        content:
          "You are a helpful assistant summarizing live web results clearly and concisely. Include a short source list.",
      },
      {
        role: "user",
        content: `Question: ${userMessage}\n\nSearch context:\n${snippets}\n\nSummarize this in plain English.`,
      },
    ],
  });

  const reply = aiResponse.choices[0]?.message?.content?.trim() || "Here’s what I found.";
  return reply + formatSources(search.results);
}

// ====== Endpoints ======
app.get("/", (_req, res) => {
  res.status(200).send("✅ iAi backend running with Institute data and web search.");
});

app.post("/", async (req, res) => {
  try {
    const { message, mode } = req.body;
    if (!message) return res.status(400).json({ reply: "Please provide a message." });

    const reply =
      mode === "web"
        ? await answerFromWeb(message)
        : await answerFromInstituteKB(message);

    res.json({ reply });
  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({ reply: "⚠️ Server error. Please try again later." });
  }
});

app.listen(PORT, () =>
  console.log(`✅ iAi hybrid backend running on port ${PORT}`)
);
