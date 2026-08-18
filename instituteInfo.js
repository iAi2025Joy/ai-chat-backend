// instituteInfo.js
//
// Static config/data: real facts about the Institute of AI (used to
// ground both /chat's system prompt and Live Chat's Realtime
// instructions in server.js), the spoken-language name lookup, and the
// shared "which models exist / what's out of scope" guidance text.
// Split out as its own module -- editing an institute fact, adding a
// new supported spoken language, or updating the model roster can be
// done here without touching anything else in server.js, and nothing
// here depends on any other module.

export const instituteData = {
  founders:
    "The Institute of AI (iAi) was founded by Prof. Wael Albayaydh from the University of Oxford and Prof. Ivan Flechais from the University of Oxford.",
  mission:
    "At the Institute of AI, we are committed to advancing artificial intelligence by fostering strong connections with premier research institutions and technology companies. Our mission is to unlock AI's potential across all sectors by identifying, incubating, and transforming innovative AI projects into revenue-generating ventures.",
  vision:
    "Our vision is to lead the AI revolution by delivering transformative value and positioning the Institute as a world leader in AI innovation.",
  location:
    "The Institute of AI is headquartered in Oxfordshire, United Kingdom, with plans to open offices in San Francisco and other global locations.",
  services:
    "The Institute of AI provides expertise and support across multiple domains:\n- AI in Predictive Analytics\n- Fintech\n- Marketing\n- Automation\n- Robotics\n- Smart Homes\n- Cybersecurity\n- Agriculture\n- Education\n- Cryptography & Blockchain",
  about:
    "At the Institute of AI (iAi), we collaborate with research institutions and technology leaders to drive innovation in intelligent systems. The institute aims to secure funding, acquire profitable startups, and expand its global research and business impact. Learn more at https://www.institute-of-ai.org",
  website:
    " The website of the Institute of AI (iAi) is https://www.institute-of-ai.org",
  garnet:
    "**GARNET** (also called Garnet) is an AI chatbot developed and under ongoing training by the Institute of AI (iAi). It's designed to provide general assistance to users in a similar spirit to other AI chatbots such as ChatGPT, Gemini, or Claude -- answering questions, helping with information, and having natural conversations.\n\n" +
    "What sets GARNET apart is a specialized focus: alongside general assistance, it studies commodity markets and works to generate the most accurate forecasts it can for future prices, using real historical data and statistical testing rather than guesswork -- currently covering **gold** and **crude oil (WTI)**.\n\n" +
    "## What it can do\n" +
    "**General assistance** -- explaining a concept, drafting or improving text, brainstorming ideas, or just having a conversation.\n\n" +
    "**Gold market:**\n" +
    "- Give a statistical prediction for gold's likely next-period direction and price -- e.g. \"What's your prediction for gold tomorrow?\"\n" +
    "- Report the current live gold price -- e.g. \"What's the gold price right now?\"\n" +
    "- Show a real chart of gold's recent price history -- e.g. \"Show me a chart of gold prices over the last 24 hours\"\n\n" +
    "**Oil market:**\n" +
    "- Give a statistical prediction for crude oil's (WTI) likely next-day direction and price -- e.g. \"What's your prediction for oil tomorrow?\"\n\n" +
    "**Both markets:**\n" +
    "- Explain what data and methodology its predictions are based on, honestly -- e.g. \"What data does your gold/oil prediction use, and how accurate is it?\"\n" +
    "- Search the web for current market news and context -- e.g. \"What's driving gold prices today?\" or \"What's happening in oil markets?\"\n\n" +
    "GARNET always presents predictions as statistical estimates, not financial advice, and is upfront when a prediction hasn't shown a reliable edge over simply assuming prices stay the same. It's built and refined by the Institute of AI as part of the Institute's broader work in AI-driven predictive analytics.",
};

// (No custom gold-data routes needed anymore -- the chatbot fetches
// prediction and history data directly from the gold-predictor GitHub
// repo's raw URLs each time, inside handleGoldPredictionCall and
// handleGoldPriceHistoryCall.)

// Maps the same 2-letter language keys the frontend's Live Chat feature
// detects (via Whisper + a script cross-check) to a real language name,
// for the explicit spoken-language reminder in /chat below.
export const SPOKEN_LANGUAGE_KEY_TO_NAME = {
  en: "English", ar: "Arabic", fr: "French", es: "Spanish", de: "German",
  pt: "Portuguese", it: "Italian", nl: "Dutch", ru: "Russian", zh: "Chinese",
  ja: "Japanese", ko: "Korean", th: "Thai", hi: "Hindi", he: "Hebrew",
};

// GARNET now has real, separate "models" the person picks from a menu
// (Prediction Model, Cybersecurity and Capacity Building, General Chat,
// Note: this list originally covered six not-yet-built models --
// Science and Research, Code, Document Creator, Video Creator, Images
// Creator, Audio Creator -- but Science and Research is now a REAL
// model (see GARNET_GENERAL_CHAT_SCIENCE_GUIDANCE and
// buildScienceModelInstructions() below), so it's been removed from
// the "out of scope, coming soon" framing entirely -- General Chat
// should genuinely try to solve real scientific problems now, not
// just give a brief general-knowledge answer and defer.
export const GARNET_MODEL_SCOPE_GUIDANCE =
  "OUT-OF-SCOPE TOPICS: if asked for programming/code help, give a genuinely helpful BRIEF general-knowledge answer (not a refusal, not silence) -- then mention that a dedicated model for that topic is coming soon and to check back for a more in-depth experience. Keep this mention brief, one short sentence, not a repeated disclaimer. " +
  "The same applies if asked to actually GENERATE a document, video, image, or audio file (not just discuss the topic) -- explain you can't produce that file directly yet, mention that a dedicated Document/Video/Images/Audio Creator model is coming soon, and in the meantime offer to help with the actual content in text form (e.g. write the document's text, describe/script the video, etc.) if that's useful.";

// Only appended in General Chat mode (mode === "chat"), same pattern as
// GARNET_GENERAL_CHAT_CYBERSECURITY_GUIDANCE below -- Science and
// Research is now a REAL model (see buildScienceModelInstructions()
// below), so General Chat should still genuinely try to solve science
// questions well, but point toward the dedicated model -- which has
// its own much more detailed problem-solving instructions and actively
// reaches for tables/charts/diagrams rather than just being told it
// theoretically could -- for real in-depth scientific work.
export const GARNET_GENERAL_CHAT_SCIENCE_GUIDANCE =
  "You're currently in GENERAL CHAT, not the Science and Research model. You can and should still solve real scientific problems here, in any discipline, with genuine step-by-step work -- don't hold back or give a lighter answer just because of the mode. But for anything that would clearly benefit from detailed analysis with real tables, charts, or diagrams (including Venn diagrams) alongside the explanation, mention that switching to the Science and Research model (from the MODELS menu) gives a more in-depth, analysis-first experience built specifically for that. Keep this mention brief, one short sentence, not a repeated disclaimer.";

// Only appended in General Chat mode (mode === "chat"), same pattern as
// GARNET_GENERAL_CHAT_PREDICTION_GUIDANCE below -- Cybersecurity and
// Capacity Building is now a REAL model (grounded in the actual GCSCC
// Cybersecurity Capacity Maturity Model via retrieval -- see
// cybersecurityModel.js), so General Chat should still answer
// cybersecurity questions helpfully, but point toward the dedicated
// model for genuinely deep/specific CMM-grounded work rather than
// silently trying to be the CMM expert itself with no real knowledge
// base behind it.
export const GARNET_GENERAL_CHAT_CYBERSECURITY_GUIDANCE =
  "You're currently in GENERAL CHAT, not the Cybersecurity and Capacity Building model. You can still answer cybersecurity questions helpfully here from general knowledge -- but for anything genuinely grounded in the GCSCC's real Cybersecurity Capacity Maturity Model (CMM), national capacity assessment, or in-depth capacity-building work, mention that switching to the Cybersecurity and Capacity Building model (from the MODELS menu) gives a more specialized, CMM-grounded experience. Keep this mention brief, one short sentence, not a repeated disclaimer.";

// Only added when mode is "chat" (General Chat) -- Prediction Model
// mode gives full predictions normally, as before.
export const GARNET_GENERAL_CHAT_PREDICTION_GUIDANCE =
  "You're currently in GENERAL CHAT, not Prediction Model. If asked for a gold, oil, or dollar-index PREDICTION or FORECAST specifically, don't give the full prediction here -- instead, give the current LIVE price (using the live price tools, not the prediction tools) and mention that for an actual prediction/forecast, they can switch to the Prediction Model from the MODELS menu. Plain factual questions about current prices are fine to answer normally and fully here.";
