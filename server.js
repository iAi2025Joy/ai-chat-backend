import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import OpenAI from "openai";

const app = express();
app.use(cors());
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Helper: extract meaningful text from DuckDuckGo results
function extractDuckDuckGoSummary(data) {
  if (data.AbstractText && data.AbstractText.trim().length > 0) {
    return data.AbstractText;
  }

  // Look into related topics if abstract missing
  if (Array.isArray(data.RelatedTopics)) {
    for (const topic of data.RelatedTopics) {
      if (topic.Text) return topic.Text;
      if (topic.Topics && topic.Topics.length > 0 && topic.Topics[0].Text)
        return topic.Topics[0].Text;
    }
  }

  // As fallback, use heading or definition
  return data.Heading || "No web results found.";
}

app.post("/chat", async (req, res) => {
  try {
    const { message, mode } = req.body;

    if (mode === "web") {
      // 🔍 Query DuckDuckGo API
      const searchResponse = await fetch(
        `https://api.duckduckgo.com/?q=${encodeURIComponent(
          message
        )}&format=json&no_redirect=1&no_html=1`
      );
      const data = await searchResponse.json();
      const summary = extractDuckDuckGoSummary(data);

      // Ask OpenAI to summarize that
      const aiResponse = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are a helpful assistant summarizing real-time web search results.",
          },
          {
            role: "user",
            content: `Summarize the following search information briefly and clearly:\n${summary}`,
          },
        ],
      });

      const reply = aiResponse.choices[0].message.content;
      return res.json({ reply });
    }

    // 🧠 Normal chat mode
    const aiResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a helpful assistant representing the Institute of AI.",
        },
        { role: "user", content: message },
      ],
    });

    const reply = aiResponse.choices[0].message.content;
    res.json({ reply });
  } catch (err) {
    console.error("Error:", err);
    res
      .status(500)
      .json({ reply: "⚠️ Server error. Please try again in a moment." });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () =>
  console.log(`✅ AI Chat backend with web search running on port ${PORT}`)
);
