// Live Gemini implementation of the AiProvider seam. Nothing outside
// services/provider.ts should import this file — see that file for why.

import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../../../config.js";
import { createChildLogger } from "../../../shared/logger.js";
import type { AiProvider, StreamChatOpts, StreamChatResult } from "../services/provider.js";

const logger = createChildLogger("gemini-stream");

let client: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI {
  // provider.ts refuses to hand this module out without a key, so reaching here
  // without one is a programming error, not an operator misconfiguration.
  if (!config.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY missing");
  client ??= new GoogleGenerativeAI(config.GEMINI_API_KEY);
  return client;
}

function isTransient(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /429|503|overloaded|high demand|rate limit/i.test(message);
}

/** Stream a multi-turn chat with Gemini. Retries transient errors up to 3 times. */
async function streamChat(opts: StreamChatOpts): Promise<StreamChatResult> {
  const model = getClient().getGenerativeModel({
    model: config.GEMINI_MODEL,
    systemInstruction: opts.system,
  });

  for (let attempt = 0; attempt < 3; attempt++) {
    // A retry restarts the answer from the first token, so it is only safe while
    // the client has seen nothing. Retrying after a partial answer would both
    // duplicate text on the wire and meter the same completion twice.
    let emitted = false;
    try {
      const result = await model.generateContentStream({
        contents: [
          ...opts.history,
          { role: "user", parts: [{ text: opts.userMessage }] },
        ],
      });

      let fullText = "";
      for await (const chunk of result.stream) {
        if (opts.signal?.aborted) break;
        const text = chunk.text();
        if (text) {
          fullText += text;
          emitted = true;
          opts.onChunk(text);
        }
      }

      const response = await result.response;
      const meta = response.usageMetadata;

      return {
        fullText,
        usage: {
          promptTokens: meta?.promptTokenCount ?? 0,
          completionTokens: meta?.candidatesTokenCount ?? 0,
          totalTokens: meta?.totalTokenCount ?? 0,
        },
      };
    } catch (err) {
      if (attempt < 2 && !emitted && isTransient(err)) {
        await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
        continue;
      }
      logger.warn("Gemini stream failed", { err: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  }
  throw new Error("unreachable");
}

/** Quick one-shot generation for auto-titling (non-streaming). */
async function generateTitle(content: string): Promise<string> {
  const model = getClient().getGenerativeModel({
    model: config.GEMINI_MODEL,
    systemInstruction:
      "Generate a 5-9 word title summarising what this chat is about. " +
      "Capture the specifics: study destination, program/subject, degree level, or topic (visa, scholarships, fees) when mentioned. " +
      "Examples: 'Data Science Masters options in Canada', 'Student visa requirements for Australia', 'Comparing MBA fees at Georgia Tech'. " +
      "Return ONLY the title — no quotes, no trailing punctuation.",
    generationConfig: { maxOutputTokens: 40, temperature: 0.3 },
  });
  const result = await model.generateContent(content.slice(0, 500));
  return result.response.text().trim().slice(0, 80);
}

export const geminiProvider: AiProvider = {
  get model() {
    return config.GEMINI_MODEL;
  },
  streamChat,
  generateTitle,
};
