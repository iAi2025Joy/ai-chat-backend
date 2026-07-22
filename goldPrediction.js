import fetch from 'node-fetch';

export const goldPredictionTool = {
  type: "function",
  function: {
    name: "get_gold_prediction",
    description: "Fetches the latest ML gold price prediction, direction, statistical confidence, and macro news sentiment.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
};

export async function handleGoldPrediction() {
const RAW_JSON_URL = "https://raw.githubusercontent.com/iAi2025Joy/ai-chat-backend/main/gold_prediction_latest.json";

  try {
    const response = await fetch(RAW_JSON_URL, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();

    return JSON.stringify({
      currentPrice: data.current_price,
      direction: data.prediction_direction,
      winProbability: data.win_probability,
      targetPrice: data.target_price,
      newsSentiment: data.news_sentiment,
      sentimentScore: data.sentiment_score,
      topHeadlines: data.top_headlines,
      lastUpdated: data.timestamp
    });
  } catch (error) {
    console.error("Error fetching gold prediction:", error);
    return JSON.stringify({
      error: "Unable to retrieve real-time prediction data at this moment."
    });
  }
}
