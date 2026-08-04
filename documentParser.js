// documentParser.js
// ====================
//
// Extracts real, actual text content from Word (.docx), PDF (.pdf),
// Excel (.xlsx), and PowerPoint (.pptx) attachments -- genuine parsing,
// not a stub. Uses "officeparser" (npm), a single library that covers
// all four formats plus a few others (.odt/.ods/.odp) through one
// consistent API, instead of needing four separate libraries.
//
// WHY THIS IS SERVER-SIDE, NOT CLIENT-SIDE (unlike plain .txt/.csv/etc.
// files, which the frontend already reads directly via FileReader):
// these are real binary formats (a .docx is actually a ZIP archive of
// XML files internally; a .pdf has its own binary structure) -- there's
// no reasonable way to extract clean text from them with plain
// browser JS. officeparser is a real Node library that does this
// properly, so it has to run here on the backend.
//
// The frontend sends each such file as a base64 data URL (the same
// pattern already used for images) in a `documents` array; this module
// decodes each one back to a raw Buffer and runs it through
// officeparser to get plain text back out.

import officeParser from "officeparser";

// Keeps a single extracted document's text from blowing up the token
// budget of the whole request -- a real, deliberate cap. Long
// documents get truncated with a clear note rather than silently
// failing or costing an enormous amount per message.
const MAX_EXTRACTED_CHARS_PER_DOC = 30000;

function base64DataUrlToBuffer(dataUrl) {
  const commaIndex = dataUrl.indexOf(",");
  const base64Part = commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
  return Buffer.from(base64Part, "base64");
}

// Extracts text from one document, returning a formatted block ready to
// fold into the chat message -- or a clear error note (not a thrown
// exception) if that specific file couldn't be parsed, so one bad file
// doesn't take down the whole request.
async function extractSingleDocument(doc) {
  try {
    const buffer = base64DataUrlToBuffer(doc.data);

    // A real, concrete sanity check before even attempting to parse --
    // if the buffer came out empty or tiny, something went wrong in the
    // base64 decode itself (e.g. a malformed data URL from the
    // frontend), which is a different failure mode than officeparser
    // genuinely rejecting a valid-but-corrupted file.
    if (buffer.length < 100) {
      console.error(`Document "${doc.name}" decoded to a suspiciously small buffer: ${buffer.length} bytes.`);
      return `File "${doc.name}": (could not be read -- the uploaded data appears incomplete).`;
    }

    let ast = await officeParser.parseOffice(buffer, { outputErrorToConsole: true });
    let text = ast && typeof ast.toText === "function" ? ast.toText() : "";

    if (!text || !text.trim()) {
      return `File "${doc.name}": (no extractable text found -- it may be image-only/scanned, or empty).`;
    }

    if (text.length > MAX_EXTRACTED_CHARS_PER_DOC) {
      text = text.slice(0, MAX_EXTRACTED_CHARS_PER_DOC) + "\n\n[...truncated, document is longer than this excerpt...]";
    }

    return `File "${doc.name}":\n---\n${text}\n---`;
  } catch (err) {
    // Logs the FULL error (not just .message) -- officeparser's real
    // failure reason (a specific XML parse error, an unsupported
    // sub-format, a genuine corruption signature, etc.) lives in
    // details that .message alone often doesn't capture.
    console.error(`Failed to parse document "${doc.name}":`, err);
    return `File "${doc.name}": (could not be read -- it may be corrupted, password-protected, or an unsupported format).`;
  }
}

// Extracts all attached documents and returns one combined block of
// text ready to prepend to the user's message -- or null if there were
// no documents to process.
export async function extractDocumentsText(documents) {
  if (!Array.isArray(documents) || documents.length === 0) return null;

  const blocks = await Promise.all(documents.map(extractSingleDocument));
  return blocks.join("\n\n");
}
