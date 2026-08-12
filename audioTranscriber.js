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
 * @param {string|null} [languageHint] - optional ISO-639-1 code (e.g.
 *   "en", "ar") to bias Whisper toward a known spoken language. A
 *   confirmed real bug this fixes: with no hint at all, Whisper must
 *   guess the spoken language from the audio alone on every single
 *   call, and on short or acoustically ambiguous clips it can and does
 *   guess wrong -- producing a transcript in a completely different
 *   language/script than what was actually said (e.g. English audio
 *   coming back as Arabic text; a wrong guess, not a translation).
 *   When the caller knows the person's usual speaking language (see the
 *   frontend's Speaking Language setting), passing it here skips that
 *   guesswork for THIS call. Left undefined/null when the caller
 *   genuinely wants full auto-detection (Speaking Language set to
 *   "auto" specifically to support switching between languages) -- this
 *   is a per-call hint, not a hard requirement, so omitting it preserves
 *   the existing any-language behavior exactly.
 * @returns {Promise<{text: string, language: string|null}>} the
 *   transcribed text and Whisper's own detected source language (a full
 *   English name like "english"/"arabic", or null if undetected)
 */
export async function transcribeAudio(audio, languageHint) {
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
    response_format: "verbose_json",
    ...(languageHint ? { language: languageHint } : {}),
  });

  // verbose_json includes Whisper's own detected source language as a
  // full English name (e.g. "english", "arabic") -- real per-utterance
  // language detection straight from the audio itself, not inferred or
  // guessed from anything else. Returned alongside the text so callers
  // (specifically Live Chat) can use it directly.
  return { text: result.text || "", language: result.language || null };
}
