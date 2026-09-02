// LLM fallback adapter — used when Gemini is unavailable (billing hold, quota, etc.).

import OpenAI from "openai";
import { config } from "../../config.js";
import { createChildLogger } from "../logger.js";

const logger = createChildLogger("llm-fallback");

let orClient: OpenAI | null = null;

export function isORConfigured(): boolean {
  return !!config.OPENROUTER_API_KEY;
}

function getORClient(): OpenAI {
  orClient ??= new OpenAI({
    apiKey: config.OPENROUTER_API_KEY!,
    baseURL: "https://openrouter.ai/api/v1",
  });
  return orClient;
}

/** Model ID for the fallback provider. */
function model(): string {
  return config.OPENROUTER_MODEL;
}

// ─── Plain types (no Gemini SDK imports → no circular dep) ───────────────────

export interface ORHistory {
  role: "user" | "model";
  parts: Array<{ text: string }>;
}

export interface ORToolDef {
  name: string;
  description?: string;
  parameters?: object;
}

export interface ORStreamResult {
  fullText: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
}

export interface ORStreamWithToolsResult extends ORStreamResult {
  toolRounds: number;
}

// ─── Format helpers ───────────────────────────────────────────────────────────

function toMessages(
  system: string,
  history: ORHistory[],
  userMessage: string,
): OpenAI.ChatCompletionMessageParam[] {
  return [
    { role: "system", content: system },
    ...history.map((h) => ({
      role: (h.role === "model" ? "assistant" : "user") as "assistant" | "user",
      content: h.parts.map((p) => p.text).join(""),
    })),
    { role: "user", content: userMessage },
  ];
}

function toOpenAITools(tools: ORToolDef[]): OpenAI.ChatCompletionTool[] {
  return tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description ?? "",
      parameters: (t.parameters ?? {}) as OpenAI.FunctionParameters,
    },
  }));
}

function mergeUsage(
  acc: ORStreamResult["usage"],
  u: OpenAI.CompletionUsage | undefined,
): void {
  if (!u) return;
  acc.promptTokens += u.prompt_tokens;
  acc.completionTokens += u.completion_tokens;
  acc.totalTokens += u.total_tokens;
}

// ─── Public functions ─────────────────────────────────────────────────────────

/** One prompt in, prose out. Mirrors gemini.ts `generateText()` contract. */
export async function orGenerateText(opts: {
  system: string;
  prompt: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<string> {
  logger.info("OpenRouter fallback: generateText");
  const res = await getORClient().chat.completions.create({
    model: model(),
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.prompt },
    ],
    max_tokens: opts.maxTokens ?? 700,
    temperature: opts.temperature ?? 0.8,
  });
  const text = res.choices[0]?.message.content?.trim() ?? "";
  if (!text) throw new Error("OpenRouter returned empty response");
  return text;
}

/** Prompt → parsed JSON. Mirrors llm-client.ts `extractJson()` contract. */
export async function orExtractJson<T>(opts: {
  system: string;
  prompt: string;
  maxTokens?: number;
}): Promise<T> {
  logger.info("OpenRouter fallback: extractJson");
  const res = await getORClient().chat.completions.create({
    model: model(),
    messages: [
      { role: "system", content: opts.system + "\n\nRespond with valid JSON only — no markdown fences." },
      { role: "user", content: opts.prompt },
    ],
    max_tokens: opts.maxTokens ?? 16384,
    temperature: 0,
  });
  const text = res.choices[0]?.message.content ?? "";
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  return JSON.parse(cleaned) as T;
}

/** Streaming multi-turn chat. Mirrors gemini-stream.ts `streamChat()` contract. */
export async function orStreamChat(opts: {
  system: string;
  history: ORHistory[];
  userMessage: string;
  onChunk: (text: string) => void;
  signal?: AbortSignal;
}): Promise<ORStreamResult> {
  logger.info("OpenRouter fallback: streamChat");
  const stream = await getORClient().chat.completions.create({
    model: model(),
    messages: toMessages(opts.system, opts.history, opts.userMessage),
    stream: true,
    stream_options: { include_usage: true },
  });

  let fullText = "";
  const usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

  for await (const chunk of stream) {
    if (opts.signal?.aborted) break;
    const text = chunk.choices[0]?.delta?.content ?? "";
    if (text) { fullText += text; opts.onChunk(text); }
    mergeUsage(usage, chunk.usage ?? undefined);
  }

  return { fullText, usage };
}

/** Agentic loop with tool calling. Mirrors gemini-stream.ts `streamChatWithTools()` contract. */
export async function orStreamChatWithTools(opts: {
  system: string;
  history: ORHistory[];
  userMessage: string;
  onChunk: (text: string) => void;
  signal?: AbortSignal;
  tools: ORToolDef[];
  runTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  onToolCall?: (name: string, args: Record<string, unknown>) => void;
  maxRounds?: number;
}): Promise<ORStreamWithToolsResult> {
  logger.info("OpenRouter fallback: streamChatWithTools");
  const or = getORClient();
  const messages: OpenAI.ChatCompletionMessageParam[] = toMessages(opts.system, opts.history, opts.userMessage);
  const openaiTools = toOpenAITools(opts.tools);
  const usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  let fullText = "";
  let toolRounds = 0;
  const maxRounds = opts.maxRounds ?? 4;

  for (let round = 0; round < maxRounds; round++) {
    if (opts.signal?.aborted) break;

    // Non-streaming for tool rounds — simpler than accumulating streamed tool call deltas
    const res = await or.chat.completions.create({
      model: model(),
      messages,
      tools: openaiTools,
      stream: false,
    });
    mergeUsage(usage, res.usage ?? undefined);

    const choice = res.choices[0];
    const assistantMsg = choice.message;
    messages.push(assistantMsg as OpenAI.ChatCompletionMessageParam);

    if (assistantMsg.content) {
      fullText += assistantMsg.content;
      opts.onChunk(assistantMsg.content);
    }

    if (!assistantMsg.tool_calls?.length || choice.finish_reason === "stop") {
      return { fullText, usage, toolRounds };
    }

    toolRounds++;
    for (const tc of assistantMsg.tool_calls) {
      // Only function-type tool calls have .function — skip custom types
      if (tc.type !== "function") continue;
      const ftc = tc as OpenAI.ChatCompletionMessageFunctionToolCall;
      const args = JSON.parse(ftc.function.arguments || "{}") as Record<string, unknown>;
      opts.onToolCall?.(ftc.function.name, args);
      const result = await opts.runTool(ftc.function.name, args);
      messages.push({ role: "tool", tool_call_id: ftc.id, content: JSON.stringify(result) });
    }
  }

  // Round cap reached — force final answer without tools, streamed for better UX
  logger.info("OR tool round cap reached — forcing final answer", { maxRounds });
  messages.push({
    role: "user",
    content: "You have run out of searches for this turn. Answer using only what you already retrieved.",
  });
  const finalStream = await or.chat.completions.create({
    model: model(),
    messages,
    stream: true,
    stream_options: { include_usage: true },
  });
  for await (const chunk of finalStream) {
    if (opts.signal?.aborted) break;
    const text = chunk.choices[0]?.delta?.content ?? "";
    if (text) { fullText += text; opts.onChunk(text); }
    mergeUsage(usage, chunk.usage ?? undefined);
  }

  return { fullText, usage, toolRounds };
}

/**
 * Embeddings via OpenRouter (openai/text-embedding-3-large at 3072 dims).
 * Same vector width as gemini-embedding-001 — no schema migration needed.
 */
export async function orEmbed(text: string, dims: number): Promise<number[]> {
  const embedModel = "openai/text-embedding-3-large";
  const res = await getORClient().embeddings.create({
    model: embedModel,
    input: text,
    dimensions: dims,
  });
  const values = res.data[0].embedding;
  const norm = Math.sqrt(values.reduce((s, v) => s + v * v, 0));
  return norm > 0 ? values.map((v) => v / norm) : values;
}

/** Non-streaming title generation. Mirrors gemini-stream.ts `generateTitle()` contract. */
export async function orGenerateTitle(content: string): Promise<string> {
  const res = await getORClient().chat.completions.create({
    model: model(),
    messages: [
      {
        role: "system",
        content:
          "Generate a 5-9 word title summarising what this chat is about. " +
          "Capture the specifics: study destination, program/subject, degree level, or topic (visa, scholarships, fees) when mentioned. " +
          "Return ONLY the title — no quotes, no trailing punctuation.",
      },
      { role: "user", content: content.slice(0, 500) },
    ],
    max_tokens: 64,
    temperature: 0.3,
  });
  return res.choices[0]?.message.content?.trim() ?? "";
}
