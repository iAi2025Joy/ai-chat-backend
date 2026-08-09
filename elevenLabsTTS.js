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

// Streams speech for the given text using the specified voice, instead
// of waiting for the entire MP3 to finish generating before returning
// anything. Uses ElevenLabs' own /stream endpoint (not the plain
// text-to-speech endpoint) -- this is what actually lets audio start
// playing on the client side after the first chunk arrives rather than
// after the whole file is done, which for longer replies was the real
// source of several extra seconds of dead air before playback started
// even with the fast eleven_flash_v2_5 model. Returns the raw fetch
// Response so the caller (server.js) can pipe response.body straight
// through to its own client as it arrives, rather than buffering it
// into memory first.
export async function streamSpeechElevenLabs(text, voiceId) {
  const apiKey = getApiKey();
  const response = await fetch(`${ELEVENLABS_API_BASE}/text-to-speech/${voiceId}/stream`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
      model_id: "eleven_flash_v2_5",
    }),
  });
  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`ElevenLabs TTS stream request failed (${response.status}): ${errText.slice(0, 300)}`);
  }
  return response;
}
