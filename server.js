// server.js
import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import bodyParser from "body-parser";
import OpenAI from "openai";

const app = express();
app.use(cors());
app.use(bodyParser.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ✅ Main chat endpoint
app.post("/chat", async (req, res) => {
  try {
    const { message, mode } = req.body;

    // -----------------------------------------------
    // 🌐 WEB SEARCH MODE
    // -----------------------------------------------
    if (mode === "web") {
      const searchUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(
        message
      )}&format=json&no_html=1&no_redirect=1`;

      const response = await fetch(searchUrl);
      const data = await response.json();

      let answer =
        data.AbstractText ||
        (data.RelatedTopics && data.RelatedTopics.length > 0
          ? data.RelatedTopics[0].Text
          : null);

      if (!answer) answer = "No clear results found. Try rephrasing your query.";

      return res.json({
        reply: `🔎 Web Search Result:\n${answer}`,
      });
    }

    // -----------------------------------------------
    // 💬 NORMAL CHAT MODE (OpenAI)
    // -----------------------------------------------
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are the Institute of AI chatbot. Answer questions about the Institute of AI accurately and professionally.",
        },
        { role: "user", content: message },
      ],
    });

    const reply = completion.choices[0].message.content;
    res.json({ reply });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ reply: "⚠️ Server error. Please try again later." });
  }
});

// -----------------------------------------------
// ✅ Start the server
// -----------------------------------------------
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`✅ AI Chat backend running on port ${PORT}`));
