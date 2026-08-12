// "Write with AI" — drafts or rewrites a feed post. Prose in, prose out; no JSON contract.

import { generateText, isConfigured } from "../../../shared/ai/gemini.js";
import * as userRepo from "../../platform-users/repositories/platform-users.repository.js";

export { isConfigured };

const SYSTEM = [
  "You write short social posts for Globaly, a study-abroad platform.",
  "Voice: first person, warm, specific, no hype, no hashtag spam (at most one hashtag).",
  "Length: 2-4 sentences, under 600 characters. Plain text only — no markdown, no preamble,",
  "no surrounding quotes. Return only the post text.",
].join(" ");

const TONE_BY_TYPE: Record<string, string> = {
  social: "a personal update sharing progress or asking peers for advice",
  promotion: "a short promotion of a service, offer, or opportunity",
  update: "a factual status update people are waiting on",
  announcement: "a clear announcement of news, with the key detail up front",
};

export async function composePost(input: {
  userId: number;
  postType: string;
  /** Existing draft. Present → rewrite it. Absent → draft from scratch. */
  draft?: string | null;
  /** Optional free-text steer from the user ("mention my IELTS result"). */
  instruction?: string | null;
}): Promise<{ content: string }> {
  const user = await userRepo.findById(input.userId);
  const author = user ? `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim() : "";

  const kind = TONE_BY_TYPE[input.postType] ?? TONE_BY_TYPE.social;
  const parts = [`Write ${kind}.`];
  if (author) parts.push(`The author is ${author}.`);
  if (input.draft?.trim()) {
    parts.push(`Improve this draft, keeping its meaning and any facts in it:\n"""\n${input.draft.trim()}\n"""`);
  } else {
    parts.push("There is no draft yet — write something a student would plausibly post today.");
  }
  if (input.instruction?.trim()) parts.push(`Extra instruction: ${input.instruction.trim()}`);

  const content = await generateText({ system: SYSTEM, prompt: parts.join("\n\n") });
  // Models occasionally wrap the whole post in quotes despite being told not to.
  return { content: content.replace(/^["'`]+|["'`]+$/g, "").trim().slice(0, 5000) };
}
