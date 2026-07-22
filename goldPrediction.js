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
  // Cache buster guarantees fresh data by bypassing GitHub's raw CDN cache
  const cacheBuster = Date.now();
  const RAW_JSON_URL = `https://raw.githubusercontent.com/iAi2025Joy/gold-predictor/main/gold_prediction_latest.json?t=${cacheBuster}`;

  try {
    const response = await fetch(RAW_JSON_URL, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();

    // Pass structured data directly to OpenAI
    return JSON.stringify({
      status: "success",
      current_price_usd: data.current_price,
      predicted_direction: data.prediction_direction,
      win_probability_confidence: data.win_probability,
      target_price_usd: data.target_price,
      dxy_index: data.dxy_index || "N/A",
      us10y_yield: data.us10y_yield || "N/A",
      macro_news_sentiment: data.news_sentiment,
      sentiment_score: data.sentiment_score,
      key_headlines: data.top_headlines,
      last_updated_timestamp: data.timestamp
    });
  } catch (error) {
    console.error("Error fetching gold prediction:", error);
    return JSON.stringify({
      status: "error",
      message: "Unable to retrieve real-time prediction data at this moment."
    });
  }
}
