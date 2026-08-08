// ------------------------------------------------------------------
// ELEVENLABS TTS -- real, cloud-hosted, high-quality speech generation
// via ElevenLabs' REST API. Requires an ELEVENLABS_API_KEY environment
// variable to be set on Render (Settings -> Environment) -- sign up for
// a free account at elevenlabs.io (no credit card required, confirmed
// directly), then find the API key under your profile/API keys page.
//
// API details verified directly against ElevenLabs' own current
// documentation before writing this:
//   - Base URL: https://api.elevenlabs.io/v1
//   - Auth: header "xi-api-key: YOUR_KEY"
//   - TTS: POST /v1/text-to-speech/{voice_id}, body { text, model_id }
//   - Voices list: GET /v1/voices
//   - eleven_multilingual_v2 model handles all 32 supported languages
//     (including Arabic) regardless of which specific voice_id is
//     used -- the voice_id selects the persona/timbre, the model
//     itself handles the actual language.
// ------------------------------------------------------------------
const ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1";

function getApiKey() {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) {
    throw new Error("ELEVENLABS_API_KEY is not configured on this deployment.");
  }
  return key;
}

export function isElevenLabsConfigured() {
  return !!process.env.ELEVENLABS_API_KEY;
}

// Returns the real list of voices available on this ElevenLabs account,
// so the frontend can let the user pick from what's ACTUALLY there
// rather than guessing at hardcoded voice IDs that may not exist or
// may change.
export async function listElevenLabsVoices() {
  const apiKey = getApiKey();
  const response = await fetch(`${ELEVENLABS_API_BASE}/voices`, {
    headers: { "xi-api-key": apiKey },
  });
  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`ElevenLabs voices request failed (${response.status}): ${errText.slice(0, 200)}`);
  }
  const data = await response.json();
  // Trimmed down to just what the frontend actually needs -- the full
  // response includes a lot of internal metadata not relevant here.
  return (data.voices || []).map((v) => ({
    voice_id: v.voice_id,
    name: v.name,
    gender: v.labels?.gender || null,
    accent: v.labels?.accent || null,
    description: v.labels?.description || null,
  }));
}

// Generates speech for the given text using the specified voice,
// returning a real MP3 audio Buffer. Uses eleven_multilingual_v2,
// which handles Arabic (and 31 other languages) directly -- no
// separate "Arabic voice" needed, any voice_id works, the model itself
// determines pronunciation from the actual text content.
export async function synthesizeSpeechElevenLabs(text, voiceId) {
  const apiKey = getApiKey();
  const response = await fetch(`${ELEVENLABS_API_BASE}/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
      // eleven_flash_v2_5, not eleven_multilingual_v2 -- Flash is
      // ElevenLabs' own recommended model for chat/assistant-style
      // real-time use cases (~75ms latency vs. multilingual v2's much
      // slower generation), and it still covers all 32 supported
      // languages including Arabic -- the language comes from the
      // model+text, not from which model tier is picked. Multilingual
      // v2 is meant for narration/audiobooks where quality matters more
      // than speed; that mismatch was the real source of the several-
      // second delay before playback started.
      model_id: "eleven_flash_v2_5",
    }),
  });
  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`ElevenLabs TTS request failed (${response.status}): ${errText.slice(0, 300)}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
