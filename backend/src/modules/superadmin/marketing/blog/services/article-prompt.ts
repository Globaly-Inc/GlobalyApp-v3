// Builds the Gemini prompt for AI blog generation and parses/validates its JSON
// response. Reuses shared/ai/gemini.ts's generateText() (prose in, prose out) rather
// than a JSON-mode client — the prompt just enforces "JSON only" and this module
// parses that text strictly, so no new Gemini client is introduced.

import { z } from "zod";
import { generateText } from "../../../../../shared/ai/gemini.js";

export interface LinkManifestEntry {
  title: string;
  url: string;
}

export interface ArticlePromptInput {
  keywords: string[];
  context?: string;
  topic?: string;
  country?: string;
  knowledgeChunks: string[];
  linkManifest: LinkManifestEntry[];
}

const SYSTEM_PROMPT =
  "You are an expert SEO/AEO content writer for Globaly, a study-abroad platform. " +
  "You always respond with a single strict JSON object and nothing else — no markdown " +
  "fences, no commentary, no leading or trailing text.";

export function buildArticlePrompt(input: ArticlePromptInput): string {
  const manifestLines = input.linkManifest.length
    ? input.linkManifest.map((m) => `- ${m.title}: ${m.url}`).join("\n")
    : "(no internal pages available yet — do not include any internal links)";

  const knowledgeBlock = input.knowledgeChunks.length
    ? input.knowledgeChunks.map((c, i) => `[Source ${i + 1}]\n${c}`).join("\n\n")
    : "(no additional knowledge base context — write from general expertise)";

  return `
Write a complete, publish-ready SEO/AEO blog article and return it as a single JSON object.

## Target keywords (must appear naturally; the first one is the primary focus keyword)
${input.keywords.map((k) => `- ${k}`).join("\n")}
${input.context ? `\n## Editorial context / brief\n${input.context}\n` : ""}${input.topic ? `\n## Topic category: ${input.topic}\n` : ""}${input.country ? `\n## Country focus: ${input.country}\n` : ""}
## Background knowledge (use for facts — do not copy verbatim)
${knowledgeBlock}

## Internal link manifest — the ONLY pages you may link to
${manifestLines}
Every internal <a href> in the article body must point to a URL from this manifest. ONLY link to URLs from the manifest — never invent a URL or link to a page not listed above.

## External links
Only link externally to authoritative domains (.gov, .edu, official national statistics agencies), and every external <a> must carry rel="noopener".

## SEO / AEO structural contract (mandatory)
- Exactly one <h1> containing the focus keyword.
- At least one <h2> containing the focus keyword; use a full H1 > H2 > H3 hierarchy.
- The focus keyword must also appear in the first paragraph.
- meta_title must be 60 characters or fewer.
- meta_description must be 155 characters or fewer.
- Include a FAQ section near the end of the article with 3 to 5 question/answer pairs
  (also return them in the "faq" field), for AEO.
- Embed JSON-LD directly in the "content" HTML: one <script type="application/ld+json">
  block with an "Article" schema, and a second with a "FAQPage" schema built from the
  same FAQ pairs.
- Compute reading_time_minutes from the article's word count at ~200 words/minute.

## Output format
Return ONLY a single JSON object (no markdown fences, no commentary) with exactly these fields:
{
  "title": string,
  "slug": string (lowercase, hyphen-separated),
  "excerpt": string (<= 300 characters),
  "content": string (the full HTML article body, including the JSON-LD script tags),
  "meta_title": string (<= 60 chars),
  "meta_description": string (<= 155 chars),
  "focus_keyword": string,
  "tags": string[],
  "reading_time_minutes": number,
  "faq": [{ "q": string, "a": string }, ... 3 to 5 items]
}
`.trim();
}

const FaqItemSchema = z.object({ q: z.string().min(1), a: z.string().min(1) });

const GeneratedArticleSchema = z.object({
  title: z.string().min(1).max(300),
  slug: z.string().trim().min(1).max(300),
  excerpt: z.string().min(1).max(500),
  content: z.string().min(1),
  meta_title: z.string().min(1).max(60),
  meta_description: z.string().min(1).max(160),
  focus_keyword: z.string().min(1),
  tags: z.array(z.string()).default([]),
  reading_time_minutes: z.number().int().positive(),
  faq: z.array(FaqItemSchema).min(3).max(5),
});

export type GeneratedArticle = z.infer<typeof GeneratedArticleSchema>;

/** Strips a ```json ... ``` fence if the model added one despite instructions not to. */
function extractJsonBlock(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : raw).trim();
}

export function parseArticleResponse(raw: string): GeneratedArticle {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonBlock(raw));
  } catch (err) {
    throw new Error(`Gemini response was not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }

  const result = GeneratedArticleSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
    throw new Error(`Gemini response failed the article schema: ${issues}`);
  }
  return result.data;
}

export async function generateArticle(input: ArticlePromptInput): Promise<GeneratedArticle> {
  const raw = await generateText({
    system: SYSTEM_PROMPT,
    prompt: buildArticlePrompt(input),
    maxTokens: 8192,
    temperature: 0.7,
  });
  return parseArticleResponse(raw);
}
