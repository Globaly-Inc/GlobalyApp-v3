// Document text extractor for the extraction pipeline.
// Handles PDFs (via Gemini vision), text formats, and skips unsupported binaries.
// Ported from V2 document-extractor.ts — V3 uses GCS + direct Gemini SDK.

import { GoogleGenerativeAI } from "@google/generative-ai";
import { Storage } from "@google-cloud/storage";
import { config } from "../../../../config.js";
import { createChildLogger } from "../../../../shared/logger.js";

const logger = createChildLogger("document-extractor");

const MAX_PDF_BYTES = 25 * 1024 * 1024; // 25 MB
const MAX_RETURN_CHARS = 40_000;

const TEXT_EXTENSIONS = new Set([
  "txt", "md", "markdown", "html", "htm", "csv", "json", "xml", "tsv",
]);
const UNSUPPORTED_EXTENSIONS = new Set(["docx", "xlsx", "pptx"]);

// ─── Types ────────────────────────────────────────────────────────────────

export interface DocInput {
  file_url: string;
  file_name: string;
  guidance?: string;
}

export interface DocResult {
  text: string;
  source: string;
  error?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function extOf(name: string): string {
  const m = name.toLowerCase().match(/\.([a-z0-9]+)(?:\?|$)/);
  return m ? m[1] : "";
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.substring(0, max) + "\n\n[…truncated…]" : s;
}

// ─── GCS download ─────────────────────────────────────────────────────────

let gcsStorage: Storage | null = null;

function getGcsStorage(): Storage | null {
  if (!config.GCS_BUCKET_NAME) return null;
  if (!gcsStorage) {
    gcsStorage = new Storage({
      projectId: config.GCS_PROJECT_ID,
      ...(config.GCS_KEY_FILE ? { keyFilename: config.GCS_KEY_FILE } : {}),
    });
  }
  return gcsStorage;
}

async function downloadFromGcs(filePath: string): Promise<Buffer | null> {
  const storage = getGcsStorage();
  if (!storage || !config.GCS_BUCKET_NAME) return null;
  try {
    const [buf] = await storage.bucket(config.GCS_BUCKET_NAME).file(filePath).download();
    return buf;
  } catch {
    return null;
  }
}

async function downloadFromHttp(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

/** Try GCS path first (strips bucket prefix if present), fall back to HTTP. */
async function downloadFile(fileUrl: string): Promise<Buffer | null> {
  const isHttp = /^https?:\/\//i.test(fileUrl);

  if (!isHttp && config.GCS_BUCKET_NAME) {
    // Treat as GCS object path
    const buf = await downloadFromGcs(fileUrl);
    if (buf) return buf;
  }

  if (isHttp) {
    return downloadFromHttp(fileUrl);
  }

  return null;
}

// ─── PDF extraction via Gemini vision ─────────────────────────────────────

async function extractPdfWithGemini(
  pdfBuffer: Buffer,
  fileName: string,
): Promise<string | null> {
  if (!config.GEMINI_API_KEY) return null;

  const ai = new GoogleGenerativeAI(config.GEMINI_API_KEY);
  // ponytail: gemini-2.0-flash for vision, not the default text model
  const model = ai.getGenerativeModel({ model: "gemini-2.0-flash" });

  const b64 = pdfBuffer.toString("base64");

  try {
    const result = await model.generateContent([
      {
        inlineData: {
          mimeType: "application/pdf",
          data: b64,
        },
      },
      {
        text: `Convert this PDF (${fileName}) to clean markdown. Return the FULL text verbatim. Preserve tables using markdown table syntax. Preserve headings, bullet points, and amounts. Do NOT summarise, paraphrase, or omit any sections. Do NOT add commentary. Output ONLY the document content.`,
      },
    ]);

    const content = result.response.text();
    if (!content || content.trim().length < 20) return null;
    return truncate(content, MAX_RETURN_CHARS);
  } catch (err) {
    logger.warn(`PDF vision extraction failed for ${fileName}: ${err}`);
    return null;
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────

export function createDocumentExtractor() {
  const cache = new Map<string, DocResult>();

  async function extract(doc: DocInput): Promise<DocResult> {
    const source = doc.guidance
      ? `${doc.file_name} (${doc.guidance})`
      : doc.file_name;

    const cached = cache.get(doc.file_url);
    if (cached) return { ...cached, source };

    const ext = extOf(doc.file_name) || extOf(doc.file_url);

    // Unsupported binary formats — skip without fetching
    if (UNSUPPORTED_EXTENSIONS.has(ext)) {
      const r: DocResult = { text: "", source, error: "unsupported_format" };
      cache.set(doc.file_url, r);
      return r;
    }

    const buf = await downloadFile(doc.file_url);
    if (!buf) {
      const r: DocResult = { text: "", source, error: "fetch_failed" };
      cache.set(doc.file_url, r);
      return r;
    }

    let text = "";
    let error: string | undefined;

    if (ext === "pdf") {
      if (!config.GEMINI_API_KEY) {
        error = "no_api_key";
      } else if (buf.length > MAX_PDF_BYTES) {
        error = "too_large";
      } else {
        const extracted = await extractPdfWithGemini(buf, doc.file_name);
        if (extracted) {
          text = extracted;
        } else {
          error = "ai_failed";
        }
      }
    } else if (TEXT_EXTENSIONS.has(ext)) {
      text = truncate(buf.toString("utf-8"), MAX_RETURN_CHARS);
    } else {
      error = "unsupported_format";
    }

    const r: DocResult = { text, source, error };
    cache.set(doc.file_url, r);
    return r;
  }

  return { extract };
}

// ─── Context builder ──────────────────────────────────────────────────────

/** Build a markdown context block from a list of documents, skipping unparseable ones. */
export async function buildDocumentContext(
  extractor: ReturnType<typeof createDocumentExtractor>,
  docs: DocInput[],
  maxTotalChars = 60_000,
): Promise<string> {
  const parts: string[] = [];
  let used = 0;

  for (const d of docs) {
    if (used >= maxTotalChars) break;
    const { text, source, error } = await extractor.extract(d);

    if (text) {
      const remaining = maxTotalChars - used;
      const snippet = text.length > remaining ? text.substring(0, remaining) : text;
      parts.push(`=== DOCUMENT: ${source} ===\n${snippet}`);
      used += snippet.length;
    } else {
      parts.push(`=== DOCUMENT (not parsed — ${error}): ${source} ===`);
    }
  }

  return parts.join("\n\n");
}
