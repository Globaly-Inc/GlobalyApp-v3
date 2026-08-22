/**
 * AI counsellor eval harness.
 *
 *   npm run ai:evals -- --token <jwt>
 *   npm run ai:evals -- --token <jwt> --only discovery-vague-interest,visa-money-requirement
 *   npm run ai:evals -- --token <jwt> --base https://staging.example.com --limit 5
 *
 * Sends each question in questions.json at a RUNNING backend over the real SSE
 * endpoint, records what came back, and runs structural checks: did it ask something,
 * did it cite a source, did it emit a card, did it hedge, did it admit a gap. Writes a
 * dated markdown report to docs/ai-counsellor/evals/.
 *
 * The checks are deliberately structural. Whether an answer is *good* is a human
 * read — the report prints every reply in full for exactly that. An LLM judge would
 * be a bigger commitment and a second thing to trust.
 *
 * Getting a token: log in as a test student and copy the access token, or mint one
 * with the same JWT_SECRET. The runner needs one because /ai-chat/messages is behind
 * auth, and each question burns a credit on that account.
 */

import "dotenv/config";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../../..");
const REPORT_DIR = resolve(REPO, "docs/ai-counsellor/evals");

interface Question {
  id: string;
  ac: string[];
  turn: string;
  /** Earlier turns sent in the same session before `prompt`. */
  setup?: string;
  setup2?: string;
  prompt: string;
  expect: string[];
}

export interface Turn {
  text: string;
  cards: unknown[];
  chips: unknown[];
  blocks: Array<{ type?: string }>;
  sources: unknown[];
  traces: string[];
  sessionId: number | null;
  error: string | null;
  ms: number;
}

const argValue = (flag: string): string | undefined => {
  const at = process.argv.indexOf(flag);
  return at === -1 ? undefined : process.argv[at + 1];
};

const TOKEN = argValue("--token") ?? process.env.AI_EVAL_TOKEN;
const BASE = (argValue("--base") ?? process.env.AI_EVAL_BASE ?? "http://localhost:3000").replace(/\/$/, "");
const ONLY = argValue("--only")?.split(",").map((s) => s.trim()).filter(Boolean);
const LIMIT = Number(argValue("--limit") ?? 0);
/** Courtesy gap between questions — each one is a real Gemini turn. */
const DELAY_MS = 1500;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Checks ──
//
// Each returns true when the reply has the shape the question expects. Keep them
// blunt: a check that needs a paragraph of regex is a check nobody will trust.

const QUESTION_RE = /\?/;
const ALTERNATIVE_RE = /\b(alternativ|another option|other option|instead|trade-?off|whereas|on the other hand|compared)/i;
const HEDGE_RE = /\b(appears|seems|generally|typically|usually|likely|may|might|often|tends to|in most cases|worth confirming|check with)/i;
const DIAGNOSIS_RE = /\b(you have (anxiety|depression|adhd|a disorder)|you are (depressed|clinically)|diagnos(e|is|ed)|mental illness|you suffer from)/i;
const GAP_RE = /\b(don't have|do not have|couldn't find|could not find|not in (our|the) system|no data|unable to confirm|I can't confirm)/i;
const REASK_BUDGET_RE = /\b(what(?:'s| is) your budget|how much (can|could) you (spend|afford)|what budget|budget range\?)/i;

export const CHECKS: Record<string, (t: Turn) => boolean> = {
  asks_question: (t) => QUESTION_RE.test(t.text) || t.blocks.some((b) => b.type === "quick_replies"),
  no_question_only: (t) => t.text.replace(/[^.!?]/g, "").length > 1,
  cites: (t) => t.sources.length > 0,
  card: (t) => t.cards.length > 0,
  no_card: (t) => t.cards.length === 0,
  block: (t) => t.blocks.length > 0,
  mentions_alternative: (t) => ALTERNATIVE_RE.test(t.text),
  hedged: (t) => HEDGE_RE.test(t.text),
  no_diagnosis: (t) => !DIAGNOSIS_RE.test(t.text),
  admits_gap: (t) => GAP_RE.test(t.text),
  no_reask_budget: (t) => !REASK_BUDGET_RE.test(t.text),
};

// ── SSE ──

export const emptyTurn = (sessionId: number | null = null): Turn => ({
  text: "", cards: [], chips: [], blocks: [], sources: [], traces: [],
  sessionId, error: null, ms: 0,
});

/**
 * Fold one SSE frame into a turn. Frames are either a named event or a bare
 * OpenAI-shaped delta; anything unparseable is ignored rather than failing the run.
 */
export function applyFrame(turn: Turn, frame: string): void {
  let event: string | null = null;
  let data = "";
  for (const line of frame.split("\n")) {
    if (line.startsWith("event: ")) event = line.slice(7).trim();
    else if (line.startsWith("data: ")) data += line.slice(6);
  }
  if (!data || data === "[DONE]") return;

  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return;
  }

  if (!event) {
    const delta = (parsed as { choices?: Array<{ delta?: { content?: string } }> })
      .choices?.[0]?.delta?.content;
    if (delta) turn.text += delta;
    return;
  }

  switch (event) {
    case "session":
      turn.sessionId = (parsed as { id: number }).id;
      break;
    case "trace":
      turn.traces.push((parsed as { step: string }).step);
      break;
    case "sources":
      turn.sources.push(...(parsed as unknown[]));
      break;
    case "cards":
      turn.cards.push(...(parsed as unknown[]));
      break;
    case "chips":
      turn.chips.push(...(parsed as unknown[]));
      break;
    case "blocks":
      turn.blocks.push(...(parsed as Array<{ type?: string }>));
      break;
    case "error":
      turn.error = (parsed as { error: string }).error;
      break;
    default:
      break;
  }
}

/** Send one message and collect the whole stream. */
async function send(content: string, sessionId: number | null): Promise<Turn> {
  const started = Date.now();
  const turn = emptyTurn(sessionId);

  const res = await fetch(`${BASE}/api/v3/ai-chat/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ content, ...(sessionId ? { session_id: sessionId } : {}) }),
  });

  if (!res.ok || !res.body) {
    turn.error = `HTTP ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`;
    turn.ms = Date.now() - started;
    return turn;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE frames are separated by a blank line; keep the trailing partial.
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) applyFrame(turn, frame);
  }

  turn.ms = Date.now() - started;
  return turn;
}

// ── Run ──

interface Result {
  question: Question;
  turn: Turn;
  checks: Array<{ name: string; pass: boolean }>;
}

async function runQuestion(q: Question): Promise<Result> {
  let sessionId: number | null = null;

  // Setup turns build the conversation state the question is really testing —
  // memory, stage, and the counsel-before-recommend gate all need a second turn.
  for (const setup of [q.setup, q.setup2].filter(Boolean) as string[]) {
    const prior = await send(setup, sessionId);
    sessionId = prior.sessionId;
    if (prior.error) return { question: q, turn: prior, checks: [] };
    await sleep(DELAY_MS);
  }

  const turn = await send(q.prompt, sessionId);
  const checks = q.expect.map((name) => ({
    name,
    pass: CHECKS[name] ? CHECKS[name]!(turn) : false,
  }));
  return { question: q, turn, checks };
}

function report(results: Result[], startedAt: string): string {
  const total = results.length;
  const errored = results.filter((r) => r.turn.error).length;
  const allChecks = results.flatMap((r) => r.checks);
  const failedChecks = allChecks.filter((c) => !c.pass).length;

  const lines: string[] = [
    `# AI Counsellor eval run — ${startedAt}`,
    "",
    `> Target: ${BASE} · ${total} question(s) · ${errored} errored · ` +
      `${allChecks.length - failedChecks}/${allChecks.length} structural checks passed`,
    "",
    "Structural checks only — they verify the shape of a reply, never whether the advice is good.",
    "Read the replies below for that. Anything marked ⚠️ is worth a human look.",
    "",
    "## Summary",
    "",
    "| Question | AC | Checks | Cards | Sources | Blocks | Latency |",
    "|---|---|---|---|---|---|---|",
  ];

  for (const r of results) {
    const status = r.turn.error
      ? "🔥 error"
      : r.checks.length === 0
        ? "—"
        : r.checks.every((c) => c.pass)
          ? "✅"
          : `⚠️ ${r.checks.filter((c) => !c.pass).map((c) => c.name).join(", ")}`;
    lines.push(
      `| \`${r.question.id}\` | ${r.question.ac.join(", ")} | ${status} | ` +
      `${r.turn.cards.length} | ${r.turn.sources.length} | ${r.turn.blocks.length} | ` +
      `${(r.turn.ms / 1000).toFixed(1)}s |`,
    );
  }

  lines.push("", "## Replies", "");
  for (const r of results) {
    lines.push(`### \`${r.question.id}\` (${r.question.ac.join(", ")})`, "");
    if (r.question.setup) lines.push(`**Setup:** ${r.question.setup}`, "");
    if (r.question.setup2) lines.push(`**Setup 2:** ${r.question.setup2}`, "");
    lines.push(`**Asked:** ${r.question.prompt}`, "");
    if (r.turn.error) {
      lines.push(`**Error:** ${r.turn.error}`, "");
      continue;
    }
    lines.push("**Replied:**", "", "> " + (r.turn.text.trim() || "(empty)").replace(/\n/g, "\n> "), "");
    if (r.checks.length) {
      lines.push(
        "**Checks:** " + r.checks.map((c) => `${c.pass ? "✅" : "❌"} ${c.name}`).join(" · "),
        "",
      );
    }
    if (r.turn.traces.length) {
      lines.push(`**Retrieval:** ${r.turn.traces.join(" · ")}`, "");
    }
    if (r.turn.cards.length) lines.push(`**Cards:** ${r.turn.cards.length}`, "");
    if (r.turn.blocks.length) {
      lines.push(`**Blocks:** ${r.turn.blocks.map((b) => b.type ?? "?").join(", ")}`, "");
    }
  }

  return lines.join("\n");
}

async function main() {
  if (!TOKEN) {
    console.error("No token. Pass --token <jwt> or set AI_EVAL_TOKEN.");
    process.exit(1);
  }

  const set = JSON.parse(readFileSync(resolve(HERE, "questions.json"), "utf-8")) as {
    questions: Question[];
  };
  let questions = set.questions;
  if (ONLY) questions = questions.filter((q) => ONLY.includes(q.id));
  if (LIMIT > 0) questions = questions.slice(0, LIMIT);

  if (!questions.length) {
    console.error("No questions selected.");
    process.exit(1);
  }

  // Fail fast on an unreachable or unauthenticated target rather than burning
  // thirty questions against it.
  const probe = await send("ping", null);
  if (probe.error) {
    console.error(`Target not usable: ${probe.error}`);
    process.exit(1);
  }
  console.log(`Target ${BASE} reachable. Running ${questions.length} question(s).\n`);

  const startedAt = new Date().toISOString().slice(0, 19).replace("T", " ");
  const results: Result[] = [];

  for (const [index, q] of questions.entries()) {
    const r = await runQuestion(q);
    results.push(r);
    const status = r.turn.error
      ? `error: ${r.turn.error.slice(0, 80)}`
      : r.checks.length === 0
        ? "recorded"
        : r.checks.every((c) => c.pass)
          ? "pass"
          : `FAIL ${r.checks.filter((c) => !c.pass).map((c) => c.name).join(",")}`;
    console.log(`  [${index + 1}/${questions.length}] ${q.id}: ${status} (${(r.turn.ms / 1000).toFixed(1)}s)`);
    await sleep(DELAY_MS);
  }

  mkdirSync(REPORT_DIR, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const path = resolve(REPORT_DIR, `${stamp}-evals.md`);
  writeFileSync(path, report(results, startedAt));

  const failed = results.flatMap((r) => r.checks).filter((c) => !c.pass).length;
  const errored = results.filter((r) => r.turn.error).length;
  console.log(`\nReport: ${path}`);
  console.log(`${failed} check(s) failed, ${errored} question(s) errored`);
  // Non-zero on transport errors only. A failed structural check is a finding to
  // read, not a broken build — the whole point is to diff runs over time.
  if (errored > 0) process.exit(1);
}

// Only run when invoked directly — the checks and frame parser are imported by tests.
if (process.argv[1]?.endsWith("run-evals.ts")) main();
