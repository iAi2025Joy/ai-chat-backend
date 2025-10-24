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

    // 🌐 Web Search Mode (Tavily)
    if (mode === "web") {
      const tavilyKey = process.env.TAVILY_API_KEY;
      const searchResponse = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tavilyKey}`,
        },
        body: JSON.stringify({
          query: message,
          max_results: 5,
        }),
      });

      const searchData = await searchResponse.json();
      const summary =
        searchData.results
          ?.map((r) => `• ${r.title}: ${r.content}`)
          .join("\n") || "No relevant results found.";

      const aiResponse = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are a helpful assistant summarizing real-time web search results in a natural, news-like style.",
          },
          {
            role: "user",
            content: `Summarize the following information:\n${summary}`,
          },
        ],
      });

      const reply = aiResponse.choices[0].message.content;
      return res.json({ reply });
    }

    // 💬 Chat Mode
    const aiResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are an assistant representing the Institute of AI. Provide factual, concise answers.",
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
  console.log(`✅ AI Chat backend with Tavily web search running on port ${PORT}`)
);
