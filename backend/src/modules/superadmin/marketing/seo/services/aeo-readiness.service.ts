import * as repo from "../repositories/snapshots.repository.js";

export type AeoReadiness = {
  hasFaqSection: boolean;
  hasFaqJsonLd: boolean;
  hasAnswerShapedIntro: boolean;
  hasMetaDescription: boolean;
  score: number; // 0-100
};

const FAQ_HEADING_RE = /<h[2-6][^>]*>\s*(frequently asked questions|faq)/i;
const FAQ_JSONLD_RE = /"@type"\s*:\s*"FAQPage"/i;
const FIRST_PARAGRAPH_RE = /<p[^>]*>([\s\S]*?)<\/p>/i;

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Answer-shaped intro heuristic (documented, deliberately simple per the plan): the first <p> is
 * a direct, skimmable answer when it's <= 60 words. No NLP — a longer first paragraph reads as
 * scene-setting/narrative, not an answer an AI overview would want to quote.
 */
export function computeAeoReadiness(content: string | null, metaDescription: string | null): AeoReadiness {
  const html = content ?? "";
  const hasFaqSection = FAQ_HEADING_RE.test(html);
  const hasFaqJsonLd = FAQ_JSONLD_RE.test(html);

  const firstParagraphMatch = html.match(FIRST_PARAGRAPH_RE);
  const introText = firstParagraphMatch ? stripHtml(firstParagraphMatch[1]) : "";
  const introWordCount = introText ? introText.split(" ").filter(Boolean).length : 0;
  const hasAnswerShapedIntro = introWordCount > 0 && introWordCount <= 60;

  const hasMetaDescription = !!metaDescription?.trim();

  const checks = [hasFaqSection, hasFaqJsonLd, hasAnswerShapedIntro, hasMetaDescription];
  const score = Math.round((checks.filter(Boolean).length / checks.length) * 100);

  return { hasFaqSection, hasFaqJsonLd, hasAnswerShapedIntro, hasMetaDescription, score };
}

export type ReadinessRow = { id: number; title: string; slug: string } & AeoReadiness;

/** Readiness checklist for every published blog — "readiness", never framed as ranking. */
export async function getReadinessForPublishedBlogs(): Promise<ReadinessRow[]> {
  const posts = await repo.listPublishedPostsForReadiness();
  return posts.map((p) => ({
    id: p.id,
    title: p.title,
    slug: p.slug,
    ...computeAeoReadiness(p.content, p.meta_description),
  }));
}
