// server.js
import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

// Allow your Webnode page to call this server
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*"); // Allow all for testing
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  next();
});

// Your OpenAI key is stored safely as an environment variable on Render
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Handle chat messages
app.post("/chat", async (req, res) => {
  const message = req.body.message;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are a friendly AI assistant for the Institute of AI." },
          { role: "user", content: message }
        ],
      }),
    });

    const data = await response.json();

    // Send the reply back to your Webnode page
    res.json({ reply: data.choices[0].message.content });

  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ reply: "Error: " + error.message });
  }
});

// Start the server
app.listen(3000, () => console.log("✅ Server is running on port 3000"));
