import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import { goldPredictionTool, handleGoldPrediction } from './goldPrediction.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS and JSON body parsing
app.use(cors());
app.use(express.json());

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Preset knowledge base for static queries about the Institute of AI (iAi)
const IAI_STATIC_KNOWLEDGE = {
  about: "The Institute of AI (iAi) is a forward-thinking global platform and research entity dedicated to advancing artificial intelligence research, education, socio-technical governance, and practical machine learning applications.",
  website: "https://www.institute-of-ai.org/",
  chatUrl: "https://www.institute-of-ai.org/iaichat"
};

/**
 * Enhanced System Prompt for OpenAI
 */
const SYSTEM_PROMPT = `You are an expert AI financial analyst and official assistant for the Institute of AI (iAi).
When users ask about gold price predictions, forecasts, or market trends:
1. Always call the 'get_gold_prediction' tool to fetch the latest statistical model metrics and macro news sentiment.
2. Present the returned data clearly:
   - Current Gold Price vs. Model Target Price
   - Predicted Direction (UP or DOWN) & Model Win Probability Confidence (%)
   - US Dollar Index (DXY) & US 10-Year Treasury Yield
   - Global Macro Sentiment (BULLISH / BEARISH / NEUTRAL) and recent headlines
3. State that these forecasts are produced by automated machine learning models and macro sentiment algorithms for educational purposes, not direct financial advice.`;

/**
 * Converts basic markdown formatting (links, bold) to HTML for frontend compatibility
 */
function formatResponseHtml(text) {
  if (!text) return "";
  
  // Convert Markdown links [text](url) to HTML <a> tags
  let formatted = text.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
  );

  // Convert **bold** to <strong>
  formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // Convert newlines to <br>
  formatted = formatted.replace(/\n/g, '<br>');

  return formatted;
}

// ==========================================
// CHAT ENDPOINT
// ==========================================
app.post('/chat', async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Message parameter is required." });
    }

    // Array to manage conversation context for OpenAI API call
    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: message }
    ];

    // Initial call to OpenAI gpt-4o-mini
    let completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: messages,
      tools: [goldPredictionTool],
      tool_choice: "auto",
    });

    let responseMessage = completion.choices[0].message;

    // Check if OpenAI requested to call the gold prediction tool
    if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
      // Append assistant's request to conversation history
      messages.push(responseMessage);

      for (const toolCall of responseMessage.tool_calls) {
        if (toolCall.function.name === "get_gold_prediction") {
          // Execute tool handler to fetch live predictions & sentiment
          const toolResult = await handleGoldPrediction();

          // Append tool result to conversation history
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: toolResult,
          });
        }
      }

      // Second call to OpenAI to synthesize tool results into final answer
      const secondCompletion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: messages,
      });

      responseMessage = secondCompletion.choices[0].message;
    }

    // Format output HTML for links/formatting and respond to frontend
    const finalReplyHtml = formatResponseHtml(responseMessage.content);

    return res.json({
      reply: finalReplyHtml,
      rawText: responseMessage.content
    });

  } catch (error) {
    console.error("Error processing chat request:", error);
    return res.status(500).json({
      reply: "⚠️ An error occurred while processing your request. Please try again later."
    });
  }
});

// Health check endpoint
app.get('/', (req, res) => {
  res.send('Institute of AI Backend Service is running.');
});

// Start express server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
