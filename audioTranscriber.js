// audioTranscriber.js
//
// Transcribes audio attachments (recorded or uploaded from the frontend)
// via OpenAI's Whisper transcription endpoint, mirroring documentParser.js's
// role for Word/PDF/Excel/PowerPoint files -- this module's only job is
// "take a base64 data URL, hand back real text," so server.js can fold
// that text into the prompt exactly the way it already does for parsed
// documents.
//
// Requires the same OPENAI_API_KEY already used elsewhere in this backend
// for chat completions and vision. No new environment variable needed.

const OpenAI = require("openai");
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Whisper's actual hard limit is 25MB per file -- matches MAX_AUDIO_BYTES
// on the frontend so a file that passes the client-side check won't get
// rejected here.
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

/**
 * Transcribes a single audio attachment.
 * @param {{ name: string, data: string }} audio - data is a base64 data URL,
 *   e.g. "data:audio/webm;codecs=opus;base64,...."
 * @returns {Promise<{ name: string, transcript: string }>}
 */
async function transcribeAudio(audio) {
  const match = audio.data.match(/^data:(.+?);base64,(.+)$/);
  if (!match) {
    throw new Error(`Could not parse audio data URL for "${audio.name}"`);
  }
  const [, mimeType, base64Data] = match;
  const buffer = Buffer.from(base64Data, "base64");

  if (buffer.length > MAX_AUDIO_BYTES) {
    throw new Error(`Audio file "${audio.name}" exceeds the 25MB Whisper limit`);
  }

  // Whisper's SDK wants a File-like object with a name -- toFile() handles
  // wrapping a raw Buffer correctly, including inferring the right
  // extension from the mime type so the API doesn't reject it.
  const { toFile } = require("openai/uploads");
  const extension = mimeType.split("/")[1]?.split(";")[0] || "webm";
  const file = await toFile(buffer, `${audio.name || "audio"}.${extension}`, { type: mimeType });

  const result = await openai.audio.transcriptions.create({
    file,
    model: "whisper-1",
  });

  return { name: audio.name, transcript: result.text || "" };
}

/**
 * Transcribes multiple audio attachments in parallel and folds each
 * transcript into a labeled block, ready to concatenate into the prompt --
 * same shape as how documentParser.js's extracted text gets used.
 * @param {Array<{ name: string, data: string }>} audios
 * @returns {Promise<string>} combined text block, or "" if audios is empty
 */
async function transcribeAllAudios(audios) {
  if (!audios || audios.length === 0) return "";

  const results = await Promise.allSettled(audios.map(transcribeAudio));

  const blocks = results.map((result, i) => {
    const name = audios[i].name || `Audio ${i + 1}`;
    if (result.status === "fulfilled") {
      return `Audio "${name}" (transcribed):\n---\n${result.value.transcript}\n---`;
    }
    console.error(`Failed to transcribe "${name}":`, result.reason);
    return `Audio "${name}": (transcription failed -- ${result.reason.message || "unknown error"})`;
  });

  return blocks.join("\n\n");
}

module.exports = { transcribeAudio, transcribeAllAudios };
