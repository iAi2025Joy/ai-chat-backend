// ------------------------------------------------------------------
// PIPER TTS -- generates real Arabic speech audio using the Piper
// binary and voice models downloaded at build time (see setupPiper.js,
// wired in via package.json's postinstall script). Genuinely NOT
// something a website's own JavaScript can do -- this is a real native
// binary, run as its own child process for each request.
//
// Honest scope note: the CLI interface used below (--model, --config,
// --output_file, reading text from stdin) is confirmed directly --
// the binary was downloaded and its --help output verified in a real
// sandbox before writing this. What could NOT be verified from that
// same sandbox (Hugging Face is unreachable from it) is whether the
// two specific voice model files this points at actually exist at
// those exact URLs -- see setupPiper.js for the full explanation.
// isVoiceAvailable() below checks for the real file on disk before
// ever attempting to use it, so a missing/failed voice model download
// surfaces as a clear "not available" response rather than a crash.
// ------------------------------------------------------------------
import fs from "fs";
import path from "path";
import os from "os";
import { spawn } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PIPER_BINARY = path.join(__dirname, "piper-data", "piper", "piper");
const ESPEAK_DATA_DIR = path.join(__dirname, "piper-data", "piper", "espeak-ng-data");
const VOICES_DIR = path.join(__dirname, "piper-data", "voices");

export function isPiperAvailable() {
  return fs.existsSync(PIPER_BINARY);
}

export function isVoiceAvailable(gender) {
  const onnxPath = path.join(VOICES_DIR, `${gender}.onnx`);
  const jsonPath = path.join(VOICES_DIR, `${gender}.onnx.json`);
  return fs.existsSync(onnxPath) && fs.existsSync(jsonPath);
}

export function getAvailableVoices() {
  return ["male", "female"].filter(isVoiceAvailable);
}

// Generates speech for the given text using the requested voice
// gender, returning a real WAV audio Buffer. Spawns the Piper binary
// fresh for each call -- Piper's own CLI is designed as a one-shot
// process (text in via stdin, WAV out to a file), not a persistent
// server, so this matches its actual intended usage rather than
// fighting against it.
export function synthesizeArabicSpeech(text, gender = "male") {
  return new Promise((resolve, reject) => {
    if (!isPiperAvailable()) {
      reject(new Error("Piper binary is not available on this deployment."));
      return;
    }
    if (!isVoiceAvailable(gender)) {
      reject(new Error(`The ${gender} Arabic voice model is not available on this deployment.`));
      return;
    }

    const modelPath = path.join(VOICES_DIR, `${gender}.onnx`);
    // A unique temp file per request -- concurrent requests must not
    // overwrite each other's output.
    const outputPath = path.join(os.tmpdir(), `piper-${Date.now()}-${Math.random().toString(36).slice(2)}.wav`);

    const piperProcess = spawn(PIPER_BINARY, [
      "--model", modelPath,
      "--output_file", outputPath,
      "--sentence_silence", "0.1", // reduced from Piper's own 0.2s default -- makes multi-sentence replies sound more continuous
      "--espeak_data", ESPEAK_DATA_DIR,
    ]);

    let stderrOutput = "";
    piperProcess.stderr.on("data", (chunk) => { stderrOutput += chunk.toString(); });

    // A defensive timeout -- a real, unexpected hang in the child
    // process (rather than the normal few-second generation time)
    // should surface as a clear error, not leave the request hanging
    // indefinitely.
    const timeoutHandle = setTimeout(() => {
      piperProcess.kill();
      reject(new Error("Piper speech generation timed out."));
    }, 20000);

    piperProcess.on("close", (code) => {
      clearTimeout(timeoutHandle);
      if (code !== 0) {
        reject(new Error(`Piper exited with code ${code}: ${stderrOutput.slice(0, 300)}`));
        return;
      }
      fs.readFile(outputPath, (err, data) => {
        fs.unlink(outputPath, () => {}); // clean up the temp file regardless of read success -- this is a one-shot file, not meant to persist
        if (err) {
          reject(new Error(`Could not read Piper's output: ${err.message}`));
          return;
        }
        resolve(data);
      });
    });

    piperProcess.on("error", (err) => {
      clearTimeout(timeoutHandle);
      reject(new Error(`Could not start Piper: ${err.message}`));
    });

    piperProcess.stdin.write(text);
    piperProcess.stdin.end();
  });
}
