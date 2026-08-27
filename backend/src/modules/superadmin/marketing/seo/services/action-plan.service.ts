import * as gemini from "../../../../../shared/ai/gemini.js";
import { ActionPlanArraySchema, type ActionPlanItem } from "../schemas/seo.schema.js";
import * as readinessService from "./aeo-readiness.service.js";
import * as rankingsService from "./rankings.service.js";

/** Parses Gemini's response into validated action items. Untrusted external output — parse
 * defensively (Gemini sometimes wraps JSON in prose or a code fence) and validate with Zod;
 * anything that doesn't fit the contract is dropped rather than surfaced broken. */
export function parseActionPlan(raw: string): ActionPlanItem[] {
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const parsed: unknown = JSON.parse(match[0]);
    const result = ActionPlanArraySchema.safeParse(parsed);
    return result.success ? result.data : [];
  } catch {
    return [];
  }
}

export async function generateActionPlan(): Promise<ActionPlanItem[]> {
  const [rankings, readiness] = await Promise.all([
    rankingsService.getRankings(),
    readinessService.getReadinessForPublishedBlogs(),
  ]);

  const text = await gemini.generateText({
    system:
      "You are an SEO/AEO strategist for an international-education platform. Given keyword " +
      "ranking data and per-blog AEO readiness checklists, produce a prioritized action plan. " +
      'Reply with ONLY a JSON array of objects: { "priority": 1|2|3, "action": string, ' +
      '"keyword"?: string, "blog_slug"?: string }. priority 1 = highest impact. Be specific, ' +
      'e.g. "keyword X at position 12 with 4k impressions — add an FAQ block and internal link ' +
      'from post Y."',
    prompt: `Rankings (28-day):\n${JSON.stringify(rankings.rows)}\n\nAEO readiness (published blogs):\n${JSON.stringify(readiness)}`,
    maxTokens: 1200,
    temperature: 0.5,
  });

  return parseActionPlan(text);
}
