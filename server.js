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

app.post("/chat", async (req, res) => {
  try {
    const { message, mode } = req.body;

    // If mode is web search, do live DuckDuckGo fetch
    if (mode === "web") {
      const searchResponse = await fetch(
        `https://api.duckduckgo.com/?q=${encodeURIComponent(
          message
        )}&format=json&no_redirect=1&no_html=1`
      );
      const searchData = await searchResponse.json();

      // Take top summary
      const summary =
        searchData.AbstractText ||
        (searchData.RelatedTopics && searchData.RelatedTopics[0]?.Text) ||
        "No web results found.";

      // Ask OpenAI to summarize result briefly
      const aiResponse = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are an assistant that summarizes real-time web search results clearly and concisely.",
          },
          { role: "user", content: `Summarize this search result: ${summary}` },
        ],
      });

      const reply = aiResponse.choices[0].message.content;
      return res.json({ reply });
    }

    // Otherwise normal chat mode
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
    res.status(500).json({ reply: "Server error, please try again later." });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`✅ AI Chat backend running on port ${PORT}`));
