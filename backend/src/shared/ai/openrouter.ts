// OpenAI-protocol LLM adapter. It fronts two independent providers and the caller picks which:
//
//   OpenRouter — the fallback hop behind Gemini. Default target, and the only one serving embeddings.
//   Ollama     — the self-hosted box, targeted explicitly by tryPrimary() when LLM_PRIMARY=ollama.
//
// Full chain with the switch on: Ollama → Gemini → OpenRouter. The two must not share a client,
// or the third hop would just retry the first one that already failed.

import OpenAI from "openai";
import { config } from "../../config.js";
import { createChildLogger } from "../logger.js";

const logger = createChildLogger("llm-fallback");

export const OLLAMA = "ollama" as const;
export const OPENROUTER = "openrouter" as const;
export type ProviderId = typeof OLLAMA | typeof OPENROUTER;

interface Target {
  client: OpenAI;
  model: string;
  provider: ProviderId;
}

let orClient: OpenAI | null = null;
let ollamaClient: OpenAI | null = null;

/** Is the fallback hop behind Gemini available? Ollama is deliberately not counted: it is the
 *  *primary* hop when enabled, and it cannot serve embeddings. */
export function isORConfigured(): boolean {
  return !!config.OPENROUTER_API_KEY;
}

function openRouterTarget(): Target {
  orClient ??= new OpenAI({
    apiKey: config.OPENROUTER_API_KEY!,
    baseURL: "https://openrouter.ai/api/v1",
  });
  return { client: orClient, model: config.OPENROUTER_MODEL, provider: OPENROUTER };
}

function ollamaTarget(): Target {
  ollamaClient ??= new OpenAI({
    baseURL: config.OLLAMA_BASE_URL!,
    // The SDK rejects an empty apiKey; the gateway is what actually authenticates.
    apiKey: config.OLLAMA_API_KEY ?? "ollama",
    // Our own gateway sits behind Cloudflare, whose bot rules reject the OpenAI SDK's
    // default User-Agent with "403 Your request was blocked." — measured: identical request,
    // SDK UA 403s, any other UA succeeds. That 403 is why Ollama has never actually served a
    // request from this app, as primary or as fallback. Identifying ourselves honestly is
    // enough to pass; the durable fix is a WAF rule on the gateway, not this line.
    defaultHeaders: { "User-Agent": "globalyapp-backend" },
    timeout: config.OLLAMA_TIMEOUT_MS,
    // The SDK retries twice by default, which turns one slow call into three and multiplies
    // the stall it is meant to bound. The fallback chain is the retry.
    maxRetries: 0,
  });
  return { client: ollamaClient, model: config.OLLAMA_MODEL, provider: OLLAMA };
}

/** Default is OpenRouter, so every pre-existing fallback call site keeps working untouched. */
function target(via?: ProviderId): Target {
  return via === OLLAMA ? ollamaTarget() : openRouterTarget();
}

function usageOf(u: OpenAI.CompletionUsage | undefined): ORStreamResult["usage"] {
  return {
    promptTokens: u?.prompt_tokens ?? 0,
    completionTokens: u?.completion_tokens ?? 0,
    totalTokens: u?.total_tokens ?? 0,
  };
}

function logUsage(t: Target, call: string, usage: ORStreamResult["usage"]): void {
  logger.info("llm usage", {
    provider: t.provider,
    model: t.model,
    call,
    promptTokens: usage.promptTokens,
    outputTokens: usage.completionTokens,
    totalTokens: usage.totalTokens,
  });
}

/**
 * Which provider `tryPrimary` should call first, or undefined for "none — go straight to
 * Gemini". Also the `via` argument every or* function takes, so callers pass this instead of
 * naming a provider themselves.
 *
 * Each option is gated on its own credential: a LLM_PRIMARY naming a provider that was never
 * configured must fall through to the normal chain rather than fail every request.
 */
export function primaryProvider(): ProviderId | undefined {
  if (config.LLM_PRIMARY === "ollama" && config.OLLAMA_BASE_URL) return OLLAMA;
  if (config.LLM_PRIMARY === "openrouter" && config.OPENROUTER_API_KEY) return OPENROUTER;
  return undefined;
}

/** True when some provider other than Gemini goes first. */
export function isORPrimary(): boolean {
  return primaryProvider() !== undefined;
}

/**
 * Providers to try after Gemini, in order: the self-hosted box first because it is already
 * paid for, OpenRouter last because it is metered. Anything unconfigured is skipped, so a
 * deployment without Ollama behaves exactly as before.
 */
export function fallbackProviders(): Array<ProviderId | undefined> {
  const chain: Array<ProviderId | undefined> = [];
  if (config.OLLAMA_BASE_URL) chain.push(OLLAMA);
  if (config.OPENROUTER_API_KEY) chain.push(OPENROUTER);
  return chain;
}

/**
 * Run `attempt` against each fallback provider until one produces a usable answer.
 *
 * `isEmpty` is not optional politeness — a reasoning model returns HTTP 200 with EMPTY
 * content when its token budget goes entirely on thinking (measured: Qwen at max_tokens 3
 * returns ""), and an empty success reaches the student as silence with nothing in the log.
 * Treating that as a failure is what makes the next provider get a turn.
 *
 * `committed` guards the streaming callers: once a chunk has reached the client we cannot
 * retry elsewhere without splicing two different replies together, so the error propagates.
 */
export async function orFallback<T>(
  call: string,
  attempt: (via: ProviderId | undefined) => Promise<T>,
  isEmpty: (result: T) => boolean,
  committed?: () => boolean,
): Promise<T> {
  const chain = fallbackProviders();
  if (!chain.length) throw new Error(`No fallback provider configured for ${call}`);

  let lastErr: unknown;
  for (const [index, via] of chain.entries()) {
    const { provider, model } = target(via);
    logger.info("llm call", { provider, model, call, role: "fallback" });
    try {
      const result = await attempt(via);
      if (!isEmpty(result)) return result;
      // Out of providers → return the empty answer rather than throwing, so the caller's
      // own error handling decides what the student sees.
      if (index === chain.length - 1) return result;
      logger.warn("fallback provider returned an empty answer — trying the next", { provider, model, call });
    } catch (err) {
      lastErr = err;
      if (committed?.()) throw err;
      const isLast = index === chain.length - 1;
      logger.warn(isLast ? "last fallback provider failed" : "fallback provider failed — trying the next", {
        provider, model, call, err: err instanceof Error ? err.message : String(err),
      });
      if (isLast) throw err;
    }
  }
  throw lastErr ?? new Error(`All fallback providers failed for ${call}`);
}

/**
 * Run `fn` first when Ollama is primary. `undefined` means "not primary, or it failed — carry on
 * with the normal Gemini path".
 *
 * `committed` exists for the streaming callers: once a chunk has reached the client we cannot
 * silently retry somewhere else, so the error propagates instead of double-writing the response.
 */
export async function tryPrimary<T>(
  call: string,
  fn: () => Promise<T>,
  committed?: () => boolean,
): Promise<T | undefined> {
  const via = primaryProvider();
  if (!via) return undefined;
  // Log the provider actually used — hardcoding ollama here mislabelled every line once
  // openrouter became selectable.
  const { provider, model } = target(via);
  logger.info("llm call", { provider, model, call, role: "primary" });
  try {
    return await fn();
  } catch (err) {
    if (committed?.()) throw err;
    logger.warn("primary LLM failed — falling through to Gemini", {
      provider,
      model,
      call,
      err: err instanceof Error ? err.message : String(err),
    });
    return undefined;
  }
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
}, via?: ProviderId): Promise<string> {
  const t = target(via);
  logger.info("llm call", { provider: t.provider, model: t.model, call: "generateText" });
  const res = await t.client.chat.completions.create({
    model: t.model,
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.prompt },
    ],
    max_tokens: opts.maxTokens ?? 700,
    temperature: opts.temperature ?? 0.8,
  });
  logUsage(t, "generateText", usageOf(res.usage));
  const text = res.choices[0]?.message.content?.trim() ?? "";
  if (!text) throw new Error(`${t.provider} returned empty response`);
  return text;
}

/** Prompt → parsed JSON. Mirrors llm-client.ts `extractJson()` contract. */
export async function orExtractJson<T>(opts: {
  system: string;
  prompt: string;
  maxTokens?: number;
}, via?: ProviderId): Promise<T> {
  const t = target(via);
  logger.info("llm call", { provider: t.provider, model: t.model, call: "extractJson" });
  const res = await t.client.chat.completions.create({
    model: t.model,
    messages: [
      { role: "system", content: opts.system + "\n\nRespond with valid JSON only — no markdown fences." },
      { role: "user", content: opts.prompt },
    ],
    max_tokens: opts.maxTokens ?? 16384,
    temperature: 0,
  });
  logUsage(t, "extractJson", usageOf(res.usage));
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
}, via?: ProviderId): Promise<ORStreamResult> {
  const t = target(via);
  logger.info("llm call", { provider: t.provider, model: t.model, call: "streamChat" });
  const stream = await t.client.chat.completions.create({
    model: t.model,
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

  logUsage(t, "streamChat", usage);
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
}, via?: ProviderId): Promise<ORStreamWithToolsResult> {
  const t = target(via);
  logger.info("llm call", { provider: t.provider, model: t.model, call: "streamChatWithTools" });
  const or = t.client;
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
      model: t.model,
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
      logUsage(t, "streamChatWithTools", usage);
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
    model: t.model,
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

  logUsage(t, "streamChatWithTools", usage);
  return { fullText, usage, toolRounds };
}

/**
 * Embeddings via OpenRouter (openai/text-embedding-3-large at 3072 dims).
 * Same vector width as gemini-embedding-001 — no schema migration needed.
 */
export async function orEmbed(text: string, dims: number): Promise<number[]> {
  const embedModel = "openai/text-embedding-3-large";
  // ponytail: OpenRouter explicitly, never `target(via)` — EMBEDDING_DIMS is 3072 and Ollama's
  // embed models are 768/1024, so following chat to Ollama would make the vector column unwritable.
  const res = await openRouterTarget().client.embeddings.create({
    model: embedModel,
    input: text,
    dimensions: dims,
  });
  const values = res.data[0].embedding;
  const norm = Math.sqrt(values.reduce((s, v) => s + v * v, 0));
  return norm > 0 ? values.map((v) => v / norm) : values;
}

/** Non-streaming title generation. Mirrors gemini-stream.ts `generateTitle()` contract. */
export async function orGenerateTitle(content: string, via?: ProviderId): Promise<string> {
  const t = target(via);
  const res = await t.client.chat.completions.create({
    model: t.model,
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
    // 64 was enough for Gemini and OpenRouter, but a reasoning model spends the whole
    // budget on thinking tokens and returns an empty title. Generous enough for both.
    max_tokens: 256,
    temperature: 0.3,
  });
  logUsage(t, "generateTitle", usageOf(res.usage));
  return res.choices[0]?.message.content?.trim() ?? "";
}
