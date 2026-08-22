import { GoogleGenerativeAI, type Content, type Part, type Tool } from "@google/generative-ai";
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

/** Retry a Gemini call up to 3 times on 429/503/overload. */
async function withRetry<T>(call: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await call();
    } catch (err) {
      if (attempt < 2 && isTransient(err)) {
        await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
        continue;
      }
      logger.warn("Gemini call failed", { err: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  }
  throw new Error("unreachable");
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

// ── Tool calling (Phase 7) ──

export interface StreamChatWithToolsOpts extends StreamChatOpts {
  tools: Tool[];
  /** Executes one tool call and returns the JSON payload handed back to the model. */
  runTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  /** Called before each tool runs, for the trace stream. */
  onToolCall?: (name: string, args: Record<string, unknown>) => void;
  /** Tool rounds before the model is forced to answer with what it has. */
  maxRounds?: number;
}

export interface StreamChatWithToolsResult extends StreamChatResult {
  /** How many rounds actually called tools — 0 means the model answered directly. */
  toolRounds: number;
}

const DEFAULT_MAX_ROUNDS = 4;

const emptyUsage = () => ({ promptTokens: 0, completionTokens: 0, totalTokens: 0 });

/**
 * Agent loop: the model may call tools, we run them, it may call more, then it
 * answers. The final answer streams to the client.
 *
 * Text is emitted as it arrives, including on a round that also calls tools — so a
 * "let me check that for you" preamble reaches the student and is kept as part of
 * the answer. Buffering until we knew whether the round called a tool would mean
 * the real answer arrives in one lump, which is worse. The system prompt asks the
 * model not to narrate its tool use, so this is rare in practice.
 */
export async function streamChatWithTools(
  opts: StreamChatWithToolsOpts,
): Promise<StreamChatWithToolsResult> {
  const maxRounds = opts.maxRounds ?? DEFAULT_MAX_ROUNDS;
  const model = getClient().getGenerativeModel({
    model: config.GEMINI_MODEL,
    systemInstruction: opts.system,
  });

  const chat = model.startChat({ history: opts.history as Content[], tools: opts.tools });
  const usage = emptyUsage();
  let fullText = "";
  let toolRounds = 0;
  let message: string | Part[] = opts.userMessage;

  const consume = async (result: Awaited<ReturnType<typeof chat.sendMessageStream>>) => {
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
    usage.promptTokens += meta?.promptTokenCount ?? 0;
    usage.completionTokens += meta?.candidatesTokenCount ?? 0;
    usage.totalTokens += meta?.totalTokenCount ?? 0;
    return response;
  };

  for (let round = 0; round < maxRounds; round++) {
    const response = await withRetry(() => chat.sendMessageStream(message)).then(consume);
    const calls = response.functionCalls();
    if (!calls?.length) return { fullText, usage, toolRounds };
    if (opts.signal?.aborted) return { fullText, usage, toolRounds };

    toolRounds++;
    const parts: Part[] = [];
    for (const call of calls) {
      const args = (call.args ?? {}) as Record<string, unknown>;
      opts.onToolCall?.(call.name, args);
      const payload = await opts.runTool(call.name, args);
      parts.push({ functionResponse: { name: call.name, response: payload as object } });
    }
    message = parts;
  }

  // Round budget spent and it still wants to search. Continue the same conversation
  // in a tool-free session so it has to answer from what it already retrieved.
  logger.info("Tool round cap reached — forcing an answer", { maxRounds });
  const closing = model.startChat({ history: await chat.getHistory() });
  await withRetry(() =>
    closing.sendMessageStream(
      "You have run out of searches for this turn. Answer the student now using only what you " +
      "already retrieved, and say plainly what you could not confirm.",
    ),
  ).then(consume);

  return { fullText, usage, toolRounds };
}

/** Quick one-shot generation for auto-titling (non-streaming). */
export async function generateTitle(content: string): Promise<string> {
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
