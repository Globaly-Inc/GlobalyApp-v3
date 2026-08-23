/**
 * Agent-loop test — asserts streamChatWithTools() runs the tools the model asks for,
 * feeds the results back, streams only the model's text, accumulates usage across
 * rounds, and forces an answer once the round budget is spent.
 * Run: node --import tsx tests/ai-tool-loop.ts   (or: npm run test:ai-tool-loop)
 *
 * Style matches tests/scraper-cascade.ts: plain tsx script, manual counters, no
 * framework. The Gemini SDK is mocked one level up — getGenerativeModel is patched
 * on the prototype — so no network and no API key are needed.
 */

process.env.GEMINI_API_KEY = "test-key";
process.env.DB_USERNAME = process.env.DB_USERNAME || "x";
process.env.DB_PASSWORD = process.env.DB_PASSWORD || "x";
process.env.DB_NAME = process.env.DB_NAME || "x";
process.env.JWT_SECRET = process.env.JWT_SECRET || "x";

import { GoogleGenerativeAI } from "@google/generative-ai";
import { cleanTitle, streamChatWithTools } from "../src/modules/ai-counsellor/lib/gemini-stream.js";
import { toolsFor } from "../src/modules/ai-counsellor/lib/tools.js";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string, detail?: unknown) {
  if (condition) {
    passed++;
    console.log(`  ok   ${label}`);
  } else {
    failed++;
    console.error(`  FAIL ${label}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
  }
}

const assertEqual = (actual: unknown, expected: unknown, label: string) =>
  assert(actual === expected, label, { actual, expected });

// ── Mock ──

interface Turn {
  /** Text the model streams this turn, in chunks. */
  chunks?: string[];
  /** Function calls the model asks for this turn. */
  calls?: Array<{ name: string; args: Record<string, unknown> }>;
}

interface SentMessage {
  toolsAvailable: boolean;
  payload: unknown;
}

/** Queue one scripted turn per sendMessageStream call; the last turn repeats. */
function mockGemini(turns: Turn[]) {
  const sent: SentMessage[] = [];
  let at = 0;

  const session = (toolsAvailable: boolean) => ({
    sendMessageStream: async (payload: unknown) => {
      sent.push({ toolsAvailable, payload });
      const turn = turns[Math.min(at, turns.length - 1)];
      at++;
      return {
        stream: (async function* () {
          for (const text of turn.chunks ?? []) yield { text: () => text };
        })(),
        response: Promise.resolve({
          functionCalls: () => (toolsAvailable ? turn.calls : undefined),
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
        }),
      };
    },
    getHistory: async () => [],
  });

  GoogleGenerativeAI.prototype.getGenerativeModel = (() => ({
    // tools are passed to startChat, so their presence tells us whether this
    // session is the tool-enabled one or the forced-answer one.
    startChat: (params: { tools?: unknown[] }) => session(!!params?.tools),
  })) as unknown as typeof GoogleGenerativeAI.prototype.getGenerativeModel;

  return { sent };
}

const baseOpts = {
  system: "you are a counsellor",
  history: [],
  userMessage: "I want to study data science in Canada",
  tools: toolsFor(),
};

async function main() {
  // 1. One tool round, then an answer.
  {
    const { sent } = mockGemini([
      { calls: [{ name: "search_courses", args: { query: "data science", country: "Canada" } }] },
      { chunks: ["Here are ", "two options."] },
    ]);
    const ran: Array<{ name: string; args: Record<string, unknown> }> = [];
    const streamed: string[] = [];

    const result = await streamChatWithTools({
      ...baseOpts,
      onChunk: (c) => streamed.push(c),
      runTool: async (name, args) => {
        ran.push({ name, args });
        return { courses: [{ name: "MSc Data Science" }] };
      },
    });

    assertEqual(ran.length, 1, "runs the tool the model asked for");
    assertEqual(ran[0]?.name, "search_courses", "tool name is passed through");
    assertEqual(ran[0]?.args.country, "Canada", "tool args are passed through");
    assertEqual(result.toolRounds, 1, "reports one tool round");
    assertEqual(result.fullText, "Here are two options.", "final text is assembled");
    assertEqual(streamed.join(""), "Here are two options.", "text is streamed to the client");
    assertEqual(sent.length, 2, "two model calls: the question, then the tool results");

    // The second call must carry the functionResponse back to the model.
    const parts = sent[1]?.payload as Array<{ functionResponse?: { name: string; response: unknown } }>;
    assertEqual(parts?.[0]?.functionResponse?.name, "search_courses", "tool result is sent back as a functionResponse");
    assert(
      JSON.stringify(parts?.[0]?.functionResponse?.response).includes("MSc Data Science"),
      "the tool's payload reaches the model",
    );
  }

  // 2. No tool call — the model just answers (the counselling-question path).
  {
    mockGemini([{ chunks: ["What draws you to data science?"] }]);
    let toolRuns = 0;
    const result = await streamChatWithTools({
      ...baseOpts,
      onChunk: () => {},
      runTool: async () => { toolRuns++; return {}; },
    });
    assertEqual(toolRuns, 0, "asking a question instead of searching runs no tools");
    assertEqual(result.toolRounds, 0, "reports zero tool rounds");
    assertEqual(result.fullText, "What draws you to data science?", "the question is the answer");
  }

  // 3. Several calls in one round all execute before the next model call.
  {
    const { sent } = mockGemini([
      {
        calls: [
          { name: "search_courses", args: { query: "nursing" } },
          { name: "search_knowledge", args: { query: "nursing registration" } },
        ],
      },
      { chunks: ["Both checked."] },
    ]);
    const ran: string[] = [];
    const result = await streamChatWithTools({
      ...baseOpts,
      onChunk: () => {},
      runTool: async (name) => { ran.push(name); return {}; },
    });
    assertEqual(ran.length, 2, "both parallel calls run");
    assertEqual(result.toolRounds, 1, "parallel calls count as one round");
    const parts = sent[1]?.payload as unknown[];
    assertEqual(parts?.length, 2, "both functionResponses go back in one turn");
  }

  // 4. Round cap: a model that never stops searching is forced to answer.
  {
    const { sent } = mockGemini([
      { calls: [{ name: "search_courses", args: { query: "loop" } }] },
    ]);
    let toolRuns = 0;
    const result = await streamChatWithTools({
      ...baseOpts,
      maxRounds: 2,
      onChunk: () => {},
      runTool: async () => { toolRuns++; return {}; },
    });
    assertEqual(toolRuns, 2, "tool runs are capped at maxRounds");
    assertEqual(result.toolRounds, 2, "reports the capped round count");
    // Last call must be on a session without tools, so it cannot search again.
    assertEqual(sent.at(-1)?.toolsAvailable, false, "the forced answer runs with tools disabled");
    assert(
      String((sent.at(-1)?.payload as string)).includes("run out of searches"),
      "the forced answer is nudged to answer from what it has",
    );
  }

  // 5. Usage is summed across every round, not just the last.
  {
    mockGemini([
      { calls: [{ name: "search_visas", args: { query: "500" } }] },
      { chunks: ["Done."] },
    ]);
    const result = await streamChatWithTools({
      ...baseOpts,
      onChunk: () => {},
      runTool: async () => ({}),
    });
    assertEqual(result.usage.totalTokens, 30, "usage accumulates over both rounds");
    assertEqual(result.usage.promptTokens, 20, "prompt tokens accumulate");
  }

  // 6. Discovery turn withholds the course tools structurally.
  {
    const names = (tools: ReturnType<typeof toolsFor>) =>
      tools.flatMap((t) => t.functionDeclarations?.map((d) => d.name) ?? []);
    const discovery = names(toolsFor({ discoveryTurn: true }));
    const normal = names(toolsFor());
    assert(!discovery.includes("search_courses"), "discovery turn has no search_courses", discovery);
    assert(!discovery.includes("get_course_details"), "discovery turn has no get_course_details", discovery);
    assert(discovery.includes("search_knowledge"), "discovery turn keeps search_knowledge");
    assertEqual(normal.length, discovery.length + 2, "only the two course tools are withheld");
  }

  console.log("\ncleanTitle — session naming");
  {
    assertEqual(cleanTitle("Student visa requirements for Australia"),
      "Student visa requirements for Australia", "a good title passes through");
    assertEqual(cleanTitle('  "Data Science Masters options in Canada."  '),
      "Data Science Masters options in Canada", "quotes and trailing punctuation are stripped");
    assertEqual(cleanTitle("**US Education System**"), "US Education System", "markdown emphasis is stripped");
    assertEqual(cleanTitle("```\nUS credit hours explained\n```"), "US credit hours explained",
      "stray code fence is stripped");

    // The actual bug: a reasoning model burns the token budget and emits a fragment.
    assertEqual(cleanTitle("Okay"), "", "single-word fragment is rejected, not saved");
    assertEqual(cleanTitle(""), "", "empty output is rejected");
    assertEqual(cleanTitle("   \n  "), "", "whitespace-only output is rejected");

    const long = cleanTitle(`Comparing ${"postgraduate ".repeat(12)}options`);
    assert(long.length <= 80, "long titles are capped at 80 chars", long.length);
    assert(!long.endsWith("postgradua"), "cap trims to a word boundary, not mid-word", long);
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
