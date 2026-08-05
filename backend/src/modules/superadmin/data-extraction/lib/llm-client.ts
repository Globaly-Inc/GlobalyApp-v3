// Gemini LLM client for structured extraction.

import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../../../../config.js";
import { createChildLogger } from "../../../../shared/logger.js";

const logger = createChildLogger("llm-client");

let genAI: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI {
  if (!config.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY not configured");
  }
  if (!genAI) {
    genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY);
  }
  return genAI;
}

/**
 * Send a prompt to Gemini and parse JSON from the response.
 */
export async function extractJson<T>(opts: {
  system: string;
  prompt: string;
  model?: string;
  maxTokens?: number;
}): Promise<T> {
  const ai = getClient();
  const model = ai.getGenerativeModel({
    model: opts.model ?? config.GEMINI_MODEL,
    systemInstruction: opts.system,
    generationConfig: {
      maxOutputTokens: opts.maxTokens ?? 8192,
      responseMimeType: "application/json",
    },
  });

  const result = await model.generateContent(opts.prompt);
  const text = result.response.text();

  try {
    return JSON.parse(text) as T;
  } catch {
    // Gemini sometimes wraps JSON in markdown code fences
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    try {
      return JSON.parse(cleaned) as T;
    } catch {
      logger.error("LLM returned invalid JSON", { raw: text.slice(0, 500) });
      throw new Error("LLM returned invalid JSON");
    }
  }
}

/**
 * Simple text completion.
 */
export async function complete(opts: {
  system: string;
  prompt: string;
  model?: string;
  maxTokens?: number;
}): Promise<string> {
  const ai = getClient();
  const model = ai.getGenerativeModel({
    model: opts.model ?? config.GEMINI_MODEL,
    systemInstruction: opts.system,
    generationConfig: {
      maxOutputTokens: opts.maxTokens ?? 2048,
    },
  });

  const result = await model.generateContent(opts.prompt);
  return result.response.text();
}

/**
 * Generate embedding vector for text (used by extraction memory).
 */
export async function embed(text: string): Promise<number[]> {
  const ai = getClient();
  const model = ai.getGenerativeModel({ model: config.GEMINI_EMBEDDING_MODEL });
  const result = await model.embedContent(text);
  return result.embedding.values;
}

export function isConfigured(): boolean {
  return !!config.GEMINI_API_KEY;
}
