import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../../../config.js";
import { BadRequestError } from "../../../shared/errors.js";
import { createChildLogger } from "../../../shared/logger.js";

const logger = createChildLogger("gemini-stream");

let client: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI {
  if (!config.GEMINI_API_KEY) {
    throw new BadRequestError("AI counsellor is not configured");
  }
  client ??= new GoogleGenerativeAI(config.GEMINI_API_KEY);
  return client;
}

function isTransient(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /429|503|overloaded|high demand|rate limit/i.test(message);
}

export interface StreamChatOpts {
  system: string;
  history: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }>;
  userMessage: string;
  onChunk: (text: string) => void;
  signal?: AbortSignal;
}

export interface StreamChatResult {
  fullText: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
}

/** Stream a multi-turn chat with Gemini. Retries transient errors up to 3 times. */
export async function streamChat(opts: StreamChatOpts): Promise<StreamChatResult> {
  const model = getClient().getGenerativeModel({
    model: config.GEMINI_MODEL,
    systemInstruction: opts.system,
  });

  for (let attempt = 0; attempt < 3; attempt++) {
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
      if (attempt < 2 && isTransient(err)) {
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
export async function generateTitle(content: string): Promise<string> {
  const model = getClient().getGenerativeModel({
    model: config.GEMINI_MODEL,
    systemInstruction: "Generate a 3-5 word title for this chat. Return ONLY the title, no quotes or punctuation.",
    generationConfig: { maxOutputTokens: 30, temperature: 0.3 },
  });
  const result = await model.generateContent(content.slice(0, 500));
  return result.response.text().trim().slice(0, 60);
}
