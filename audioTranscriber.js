// audioTranscriber.js
//
// Transcribes audio attachments (recorded live or uploaded from the
// frontend) via OpenAI's Whisper transcription endpoint, mirroring the
// role documentParser.js already plays for Word/PDF/Excel/PowerPoint
// files -- this module's only job is "take a base64 data URL, hand back
// real text," so server.js can fold that text into effectiveMessage the
// same way it already folds in extracted document text.
//
// Uses the same OPENAI_API_KEY already configured for chat completions
// and vision elsewhere in this backend -- no new environment variable
// needed.

import OpenAI from "openai";
import { toFile } from "openai/uploads";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Whisper's actual hard limit is 25MB per file -- matches MAX_AUDIO_BYTES
// on the frontend so a file that passes the client-side check won't get
// rejected here.
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

/**
 * Transcribes a single audio attachment.
 * @param {{ name: string, data: string }} audio - data is a base64 data
 *   URL, e.g. "data:audio/webm;codecs=opus;base64,...."
 * @returns {Promise<string>} the transcribed text
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

  // toFile() wraps a raw Buffer into the File-like shape the SDK's
  // upload endpoints expect, inferring a sensible filename/extension
  // from the mime type so Whisper doesn't reject it for looking
  // extension-less.
  const extension = mimeType.split("/")[1]?.split(";")[0] || "webm";
  const file = await toFile(buffer, `${audio.name || "audio"}.${extension}`, { type: mimeType });

  const result = await openai.audio.transcriptions.create({
    file,
    model: "whisper-1",
  });

  return result.text || "";
}

/**
 * Transcribes multiple audio attachments in parallel and folds each
 * transcript into a labeled block, ready to append to effectiveMessage --
 * same shape as how extractDocumentsText's output already gets used.
 * @param {Array<{ name: string, data: string }> | undefined} audios
 * @returns {Promise<string>} combined text block, or "" if audios is empty
 */
export async function transcribeAllAudios(audios) {
  if (!Array.isArray(audios) || audios.length === 0) return "";

  const results = await Promise.allSettled(audios.map(transcribeAudio));

  const blocks = results.map((result, i) => {
    const name = audios[i].name || `Audio ${i + 1}`;
    if (result.status === "fulfilled") {
      return `Audio "${name}" (transcribed):\n---\n${result.value}\n---`;
    }
    console.error(`Failed to transcribe "${name}":`, result.reason.message || result.reason);
    return `Audio "${name}": (transcription failed -- ${result.reason.message || "unknown error"})`;
  });

  return blocks.join("\n\n");
}
