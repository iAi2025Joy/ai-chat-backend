// audioTranscriber.js
//
// Transcribes a single audio clip (recorded live via the mic button, or
// uploaded as a file) via OpenAI's gpt-4o-transcribe endpoint. Used by
// the dedicated POST /transcribe route in server.js -- the frontend
// calls that route BEFORE the message is ever sent to /chat, fills the
// input box with the returned text, and the person reviews/edits it
// like any normal typed message. Audio itself never travels through
// /chat as an attachment.
//
// MODEL CHOICE -- a confirmed real, well-documented bug this fixes:
// this used to run on OpenAI's older "whisper-1" model, which has a
// widely-reported hallucination failure mode where it transcribes
// perfectly clear speech into a COMPLETELY WRONG language/script (e.g.
// clear English audio coming back as Arabic, Hindi, Malay, or other
// text) -- independent of any language hint passed to it, confirmed by
// numerous other real-world reports of the exact same symptom (see
// e.g. https://techcommunity.microsoft.com/discussions/azuretools/whisper-1-model-transcribes-english-audio-incorrectly/4426663
// and https://learn.microsoft.com/en-us/answers/questions/2182774/azure-openai-whisper-hallucinates-source-audio-lan).
// This is a known limitation of the whisper-1 model itself, not
// something fixable by tuning parameters. Migrated to "gpt-4o-transcribe"
// instead -- a newer, more accurate OpenAI transcription model with a
// lower word error rate and better language recognition, directly
// confirmed by independent real-world migration reports (e.g.
// https://zenn.dev/daishiro/articles/whisper-hallucination-gpt4o-transcribe)
// to eliminate this exact whisper-1 hallucination behavior entirely.
//
// Uses the same OPENAI_API_KEY already configured for chat completions
// and vision elsewhere in this backend -- no new environment variable
// needed.

import OpenAI from "openai";
import { toFile } from "openai/uploads";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 25MB is OpenAI's hard limit per audio file across its transcription
// models (whisper-1 and gpt-4o-transcribe alike).
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

/**
 * Transcribes a single audio clip.
 * @param {{ name?: string, data: string }} audio - data is a base64 data
 *   URL, e.g. "data:audio/webm;codecs=opus;base64,...."
 * @param {string|null} [languageHint] - optional ISO-639-1 code (e.g.
 *   "en", "ar") to bias transcription toward a known spoken language.
 *   Only pass this when the person has EXPLICITLY chosen a specific
 *   Speaking Language in Settings -- it's a real assumption the model
 *   decodes around, so a wrong or guessed hint actively makes
 *   transcription WORSE for anyone speaking a different language than
 *   the hint. Left undefined/null for genuine per-call auto-detection,
 *   which is what correctly handles someone who speaks more than one
 *   language into the mic.
 * @returns {Promise<{text: string, language: string|null}>} the
 *   transcribed text. `language` is always null -- gpt-4o-transcribe's
 *   JSON response format doesn't include a detected-language field the
 *   way whisper-1's verbose_json used to (confirmed unused by every
 *   caller in this codebase either way, so this has no real effect).
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
    throw new Error("Audio exceeds the 25MB limit.");
  }

  // toFile() wraps a raw Buffer into the File-like shape the SDK's
  // upload endpoints expect, inferring a sensible filename/extension
  // from the mime type so the API doesn't reject it for looking
  // extension-less.
  const extension = mimeType.split("/")[1]?.split(";")[0] || "webm";
  const file = await toFile(buffer, `${audio.name || "audio"}.${extension}`, { type: mimeType });

  const result = await openai.audio.transcriptions.create({
    file,
    model: "gpt-4o-transcribe",
    // gpt-4o-transcribe only supports "json" or "text" response
    // formats -- "verbose_json" (which whisper-1 supported, and which
    // this used to request for its per-response detected-language
    // field) throws an error on this model.
    response_format: "json",
    ...(languageHint ? { language: languageHint } : {}),
  });

  return { text: result.text || "", language: null };
}
