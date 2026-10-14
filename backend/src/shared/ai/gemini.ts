// Plain-text Gemini generation for user-facing writing assistance.
//
// Lives in shared/ (alongside mail, queue, storage) rather than reaching into
// modules/superadmin/data-extraction/lib/llm-client.ts, which is that module's internal JSON-extraction
// client. Same provider, different contract: this one returns prose, not parsed JSON.

import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../../config.js";
import { BadRequestError } from "../errors.js";
import { createChildLogger } from "../logger.js";
import { isORConfigured, orGenerateText } from "./openrouter.js";

const logger = createChildLogger("gemini-text");

let client: GoogleGenerativeAI | null = null;

export function isConfigured(): boolean {
  return !!config.GEMINI_API_KEY;
}

function getClient(): GoogleGenerativeAI {
  if (!config.GEMINI_API_KEY) {
    // A 400 with a clear message, not a 500: the deployment is missing a key, the request is not malformed.
    throw new BadRequestError("AI writing assistance is not configured");
  }
  client ??= new GoogleGenerativeAI(config.GEMINI_API_KEY);
  return client;
}

function isTransient(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /429|503|overloaded|high demand|rate limit/i.test(message);
}

/** One prompt in, prose out. Retries only transient provider errors. */
export async function generateText(opts: {
  system: string;
  prompt: string;
  maxTokens?: number;
  temperature?: number;
  /**
   * "lite" routes the call to GEMINI_MODEL_LITE — same opt-out as extractJson's tier in the
   * data-extraction llm-client: set GEMINI_MODEL_LITE to GEMINI_MODEL's value and every lite
   * caller is back on the full model without a code change.
   *
   * For a small fixed classification sitting in front of a visitor's reply, not for prose.
   */
  tier?: "lite";
}): Promise<string> {
  try {
    const model = getClient().getGenerativeModel({
      model: opts.tier === "lite" && config.GEMINI_MODEL_LITE ? config.GEMINI_MODEL_LITE : config.GEMINI_MODEL,
      systemInstruction: opts.system,
      generationConfig: {
        maxOutputTokens: opts.maxTokens ?? 700,
        temperature: opts.temperature ?? 0.8,
      },
    });

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const result = await model.generateContent(opts.prompt);
        const text = result.response.text().trim();
        if (!text) throw new Error("empty response");
        return text;
      } catch (err) {
        if (attempt < 2 && isTransient(err)) {
          await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
          continue;
        }
        throw err;
      }
    }
    throw new Error("unreachable");
  } catch (err) {
    logger.warn("Gemini generateText failed — trying OpenRouter fallback", { err: err instanceof Error ? err.message : String(err) });
    if (isORConfigured()) return orGenerateText(opts);
    throw err;
  }
}
