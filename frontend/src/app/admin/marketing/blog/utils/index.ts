import type { BlogPost } from "../apis/types";

export function generateSlug(title: string): string {
  return title.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function calculateReadingTime(content: string): number {
  const words = content.replace(/<[^>]+>/g, " ").trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

/**
 * Live preview only — the server recomputes and persists the real score on save,
 * so this must stay logically identical to `calculateSeoScore` in the backend's posts.service.ts.
 */
export function calculateSeoScore(post: Partial<BlogPost>): { score: number; checks: Record<string, boolean> } {
  const focusKeyword = post.focus_keyword?.trim().toLowerCase() ?? "";
  const title = post.title ?? "";
  const slug = post.slug ?? "";
  const content = post.content ?? "";
  const plainText = content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const wordCount = plainText ? plainText.split(" ").length : 0;
  const intro = plainText.slice(0, 300).toLowerCase();
  const keywordOccurrences = focusKeyword
    ? (plainText.toLowerCase().match(new RegExp(focusKeyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? []).length
    : 0;
  const density = wordCount > 0 ? (keywordOccurrences / wordCount) * 100 : 0;
  const metaDescLength = post.meta_description?.length ?? 0;

  const checks = {
    keywordInTitle: !!focusKeyword && title.toLowerCase().includes(focusKeyword),
    keywordInSlug: !!focusKeyword && slug.toLowerCase().includes(focusKeyword),
    keywordInIntro: !!focusKeyword && intro.includes(focusKeyword),
    keywordDensity: !!focusKeyword && density >= 0.5 && density <= 3,
    titleLength: title.length >= 30 && title.length <= 60,
    metaDescLength: metaDescLength >= 120 && metaDescLength <= 160,
    contentLength: wordCount >= 300,
    hasSubheadings: /<h[2-6]/i.test(content),
    hasImages: /<img/i.test(content),
    hasFocusKeyword: !!focusKeyword,
  };
  const passed = Object.values(checks).filter(Boolean).length;
  return { score: Math.round((passed / Object.keys(checks).length) * 100), checks };
}
