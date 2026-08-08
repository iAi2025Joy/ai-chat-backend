// ------------------------------------------------------------------
// PIPER TTS SETUP -- downloads the Piper binary and Arabic voice
// models once, at BUILD time (wired in via package.json's postinstall
// script), not at runtime. This matters specifically because Render's
// free tier has an EPHEMERAL filesystem: any files written at runtime
// are wiped every time the service restarts or spins down (which
// happens automatically after 15 minutes of inactivity on the free
// tier). Files present at the END of the build step become part of
// that deploy's filesystem snapshot and persist for the life of the
// deploy -- so downloading here, once, avoids a slow ~25MB+ re-download
// on the first request after every single cold start.
//
// Verified directly before use: the exact piper_linux_x86_64.tar.gz
// binary below was downloaded and actually run in a real Linux
// sandbox -- confirmed to produce real, working --help output, not
// just assumed. Genuinely NOT verified (couldn't be, from that same
// sandbox -- Hugging Face is unreachable from it): the two voice model
// URLs below. Render's own build environment should have normal
// internet access and be able to reach Hugging Face directly, but this
// is the one part of the whole setup that couldn't be tested ahead of
// time. If the female voice URL specifically turns out wrong (e.g. the
// uploader renamed a file), this script logs a clear warning and
// continues with just the male voice, rather than failing the whole
// build over one optional voice.
// ------------------------------------------------------------------
import fs from "fs";
import path from "path";
import https from "https";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PIPER_DIR = path.join(__dirname, "piper-data");
const BINARY_URL = "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_x86_64.tar.gz";
const VOICES = {
  male: {
    onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/ar/ar_JO/kareem/medium/ar_JO-kareem-medium.onnx",
    json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/ar/ar_JO/kareem/medium/ar_JO-kareem-medium.onnx.json",
  },
  female: {
    // Best-effort URL based on the model card's own usage example --
    // genuinely not verified against Hugging Face directly (see note
    // above). If this 404s, downloadFile() below logs a warning and
    // setup continues with just the male voice rather than failing.
    onnx: "https://huggingface.co/vadimbelsky/arabic-emirati-female-piper/resolve/main/arabic-emirati-female-model.onnx",
    json: "https://huggingface.co/vadimbelsky/arabic-emirati-female-piper/resolve/main/arabic-emirati-female-model.onnx.json",
  },
};

function downloadFile(url, destPath) {
  return new Promise((resolve) => {
    const file = fs.createWriteStream(destPath);
    const request = https
      .get(url, { headers: { "User-Agent": "garnet-chat-setup" }, timeout: 30000 }, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          // Follow one redirect -- Hugging Face's resolve/ URLs commonly redirect to their actual CDN storage location.
          const redirectRequest = https.get(response.headers.location, { timeout: 30000 }, (redirected) => {
            redirected.pipe(file);
            file.on("finish", () => file.close(() => resolve(true)));
          });
          redirectRequest.on("timeout", () => redirectRequest.destroy());
          redirectRequest.on("error", (err) => {
            console.warn(`⚠️  Piper setup: failed to download ${url} (after redirect): ${err.message}`);
            resolve(false);
          });
          return;
        }
        if (response.statusCode !== 200) {
          console.warn(`⚠️  Piper setup: ${url} returned status ${response.statusCode}, skipping.`);
          file.close();
          fs.unlink(destPath, () => {});
          resolve(false);
          return;
        }
        response.pipe(file);
        file.on("finish", () => file.close(() => resolve(true)));
      });
    request.on("timeout", () => request.destroy());
    request.on("error", (err) => {
      console.warn(`⚠️  Piper setup: failed to download ${url}: ${err.message}`);
      resolve(false);
    });
  });
}

async function main() {
  fs.mkdirSync(PIPER_DIR, { recursive: true });

  // 1. Binary -- required. If this fails, Piper TTS won't work at all,
  // but the rest of the backend (chat, transcription, predictions)
  // should still function normally -- server.js checks for the
  // binary's presence before ever trying to use it.
  const tarPath = path.join(PIPER_DIR, "piper.tar.gz");
  console.log("Downloading Piper binary...");
  const binaryOk = await downloadFile(BINARY_URL, tarPath);
  if (binaryOk) {
    execSync(`tar -xzf "${tarPath}" -C "${PIPER_DIR}"`);
    fs.unlinkSync(tarPath);
    console.log("✅ Piper binary extracted.");
  } else {
    console.warn("⚠️  Piper binary download failed -- Piper TTS will be unavailable, but the rest of the backend is unaffected.");
  }

  // 2. Voice models -- each attempted independently, so a failure on
  // one (most likely the female voice, given its URL is a best-effort
  // guess) doesn't block the other.
  const voicesDir = path.join(PIPER_DIR, "voices");
  fs.mkdirSync(voicesDir, { recursive: true });

  for (const [gender, urls] of Object.entries(VOICES)) {
    console.log(`Downloading ${gender} Arabic voice model...`);
    const onnxPath = path.join(voicesDir, `${gender}.onnx`);
    const jsonPath = path.join(voicesDir, `${gender}.onnx.json`);
    const onnxOk = await downloadFile(urls.onnx, onnxPath);
    const jsonOk = await downloadFile(urls.json, jsonPath);
    if (onnxOk && jsonOk) {
      console.log(`✅ ${gender} voice ready.`);
    } else {
      console.warn(`⚠️  ${gender} voice model download failed -- this specific voice will be unavailable. Check the URL in setupPiper.js if this persists.`);
    }
  }

  console.log("Piper setup complete.");
  process.exit(0); // required -- confirmed via direct testing that lingering HTTPS keep-alive connections otherwise prevent the process from naturally exiting, which would hang the actual build step on Render indefinitely
}

main().catch((err) => {
  console.error("Piper setup encountered an unexpected error:", err.message);
  // Deliberately exits 0 (not a failure code) even on an unexpected
  // error -- a broken Piper setup should not block the whole backend
  // from deploying, given everything else (chat, transcription,
  // predictions) is unrelated and should still work fine.
  process.exit(0);
});
