// Guards the pdf-parse text-extraction fallback in the extraction pipeline.
// Broke once when pdf-parse v2 replaced the v1 callable export with a PDFParse class.
import assert from "node:assert/strict";
import { extractPdfText } from "../src/modules/superadmin/data-extraction/lib/document-extractor.js";

// Minimal one-page PDF carrying real text content.
const TEXT_PDF = Buffer.from(
  `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 200]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj
4 0 obj<</Length 62>>stream
BT /F1 12 Tf 20 100 Td (Tuition fee 12345 USD per year) Tj ET
endstream
endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
trailer<</Root 1 0 R>>`,
  "latin1",
);

async function main() {
  const text = await extractPdfText(TEXT_PDF);
  assert.ok(text, "expected text from a text-based PDF, got null");
  assert.match(text, /Tuition fee 12345 USD/);

  // Truncation honours maxChars.
  const short = await extractPdfText(TEXT_PDF, 25);
  assert.ok(short && short.length <= 25 + 20, `unexpected length: ${short?.length}`);

  // Garbage in → null, not a throw.
  assert.equal(await extractPdfText(Buffer.from("not a pdf")), null);

  console.log("pdf-extract: all checks passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
