// Plain-text Gemini generation for user-facing writing assistance.
//
// Lives in shared/ (alongside mail, queue, storage) rather than reaching into
// modules/superadmin/data-extraction/lib/llm-client.ts, which is that module's internal JSON-extraction
// client. Same provider, different contract: this one returns prose, not parsed JSON.

import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../../config.js";
import { BadRequestError } from "../errors.js";
import { createChildLogger } from "../logger.js";

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
}): Promise<string> {
  const model = getClient().getGenerativeModel({
    model: config.GEMINI_MODEL,
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
      logger.warn("AI text generation failed", { err: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  }
  throw new Error("unreachable");
}
