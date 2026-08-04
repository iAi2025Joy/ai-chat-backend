// audioTranscriber.js
//
// Transcribes a single audio clip (recorded live via the mic button, or
// uploaded as a file) via OpenAI's Whisper transcription endpoint.
// Used by the dedicated POST /transcribe route in server.js -- the
// frontend calls that route BEFORE the message is ever sent to /chat,
// fills the input box with the returned text, and the person reviews/
// edits it like any normal typed message. Audio itself never travels
// through /chat as an attachment.
//
// Uses the same OPENAI_API_KEY already configured for chat completions
// and vision elsewhere in this backend -- no new environment variable
// needed.

import OpenAI from "openai";
import { toFile } from "openai/uploads";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Whisper's actual hard limit is 25MB per file.
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

/**
 * Transcribes a single audio clip.
 * @param {{ name?: string, data: string }} audio - data is a base64 data
 *   URL, e.g. "data:audio/webm;codecs=opus;base64,...."
 * @returns {Promise<string>} the transcribed text
 */
export async function transcribeAudio(audio) {
  if (!audio || typeof audio.data !== "string") {
    throw new Error("No audio data provided.");
  }

  const match = audio.data.match(/^data:(.+?);base64,(.+)$/);
  if (!match) {
    throw new Error("Could not parse audio data URL.");
  }
  const [, mimeType, base64Data] = match;
  const buffer = Buffer.from(base64Data, "base64");

  if (buffer.length > MAX_AUDIO_BYTES) {
    throw new Error("Audio exceeds the 25MB Whisper limit.");
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
