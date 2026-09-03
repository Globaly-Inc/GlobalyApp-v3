import { masterKnex } from "../../../../../core/db/master-pool.js";
import * as gemini from "../../../../../shared/ai/gemini.js";
import { createChildLogger } from "../../../../../shared/logger.js";
import * as gscClient from "../lib/gsc-client.js";
import * as snapshotsRepo from "../repositories/snapshots.repository.js";

const logger = createChildLogger("seo-suggestions");

export type Suggestion = {
  keyword: string;
  source: "gsc" | "ai";
  impressions?: number;
  position?: number;
};

/** Case-insensitive dedup — GSC (real demand data) wins over an AI guess for the same term. */
export function mergeSuggestions(gscSuggestions: Suggestion[], aiSuggestions: Suggestion[]): Suggestion[] {
  const byKeyword = new Map<string, Suggestion>();
  for (const s of [...gscSuggestions, ...aiSuggestions]) {
    const key = s.keyword.trim().toLowerCase();
    if (!key || byKeyword.has(key)) continue;
    byKeyword.set(key, s);
  }
  return [...byKeyword.values()];
}

// Real demand, weak position: impressions but ranking beyond page 1 (position > 10).
const MIN_IMPRESSIONS = 100;
const MIN_POSITION = 10;

async function getGscSuggestions(): Promise<Suggestion[]> {
  if (!(await gscClient.isConfigured())) return [];
  try {
    const end = new Date();
    const start = new Date(end);
    start.setDate(end.getDate() - 28);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const rows = await gscClient.querySearchAnalytics({
      startDate: fmt(start),
      endDate: fmt(end),
      dimensions: ["query"],
      rowLimit: 1000,
    });
    return rows
      .filter((r) => r.impressions > MIN_IMPRESSIONS && r.position > MIN_POSITION && r.keys[0])
      .map((r) => ({ keyword: r.keys[0]!, source: "gsc" as const, impressions: r.impressions, position: r.position }));
  } catch (err) {
    logger.warn("GSC suggestions fetch failed", { err: err instanceof Error ? err.message : String(err) });
    return [];
  }
}

async function getAiSuggestions(): Promise<Suggestion[]> {
  if (!gemini.isConfigured()) return [];
  try {
    const [tracked, categories] = await Promise.all([
      snapshotsRepo.trackedKeywords(),
      masterKnex("superadmin.blog_posts").whereNotNull("category").whereNull("deleted_at").distinct("category"),
    ]);
    const topics = categories.map((r) => r.category as string).filter(Boolean);
    const text = await gemini.generateText({
      system:
        "You are an SEO keyword researcher for an international-education platform. Given existing " +
        "target keywords and content topics, suggest additional high-intent keyword phrases worth " +
        "targeting. Reply with ONLY a plain list, one keyword phrase per line, no numbering, no commentary.",
      prompt:
        `Existing keywords: ${tracked.slice(0, 40).join(", ") || "none yet"}\n` +
        `Content topics: ${topics.join(", ") || "none yet"}\n\n` +
        "Suggest up to 15 new keyword phrases.",
      maxTokens: 400,
      temperature: 0.6,
    });
    return text
      .split("\n")
      .map((line) => line.replace(/^[-*\d.\s]+/, "").trim())
      .filter(Boolean)
      .slice(0, 15)
      .map((keyword) => ({ keyword, source: "ai" as const }));
  } catch (err) {
    logger.warn("AI suggestions generation failed", { err: err instanceof Error ? err.message : String(err) });
    return [];
  }
}

export async function getSuggestions(): Promise<Suggestion[]> {
  const [gscSuggestions, aiSuggestions] = await Promise.all([getGscSuggestions(), getAiSuggestions()]);
  return mergeSuggestions(gscSuggestions, aiSuggestions);
}
