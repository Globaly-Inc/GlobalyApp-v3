// Worker — consumes "blog.generate".
//
// For one blog_generation_jobs row: claim it, search the AI counsellor knowledge base
// for the requested keywords, build an internal-link manifest from live blog + country
// pages, ask Gemini for a publish-ready SEO/AEO article, generate a Higgsfield cover
// (best-effort — a cover failure never fails the job), and insert the result as an
// unpublished blog_posts draft. Per-job isolation: one job's failure never touches
// its siblings (mirrors enquiry-email.worker.ts's per-row isolation).
//
// Run with: npm run job:blog-generate

import "dotenv/config";
import { masterKnex } from "../../../../../core/db/master-pool.js";
import { queueService } from "../../../../../shared/queue/queueService.js";
import * as storage from "../../../../../shared/storage/storageService.js";
import { config } from "../../../../../config.js";
import { createChildLogger } from "../../../../../shared/logger.js";
// Same cross-module embedding client the ai-counsellor RAG service and the ai-knowledge
// crawl worker both use — one embedding client for the platform, not duplicated here.
import { embed, isConfigured as embeddingConfigured } from "../../../data-extraction/lib/llm-client.js";
import { matchKnowledgeChunks } from "../../../../ai-counsellor/repositories/knowledge.repository.js";
import * as jobsRepo from "../repositories/generation-jobs.repository.js";
import type { GenerationJobRow } from "../repositories/generation-jobs.repository.js";
import * as postsRepo from "../repositories/posts.repository.js";
import { generateArticle } from "../services/article-prompt.js";
import type { GeneratedArticle, LinkManifestEntry } from "../services/article-prompt.js";
import { generateCoverImage } from "../lib/higgsfield.js";
import { BLOG_GENERATE_QUEUE } from "../services/generation.service.js";

const logger = createChildLogger("blog-generate-worker");
const KNOWLEDGE_CHUNK_COUNT = 6;

async function buildLinkManifest(): Promise<LinkManifestEntry[]> {
  const [posts, countries] = await Promise.all([
    masterKnex("superadmin.blog_posts")
      .where({ is_published: true })
      .whereNull("deleted_at")
      .select("id", "title"),
    masterKnex("countries").where({ is_active: true }).whereNull("deleted_at").whereNotNull("slug").select("name", "slug"),
  ]);

  return [
    ...posts.map((p: { id: number; title: string }) => ({ title: p.title, url: `/blog/${p.id}` })),
    ...countries.map((c: { name: string; slug: string }) => ({ title: c.name, url: `/country/${c.slug}` })),
  ];
}

async function searchKnowledge(keywords: string[], country: string | null): Promise<string[]> {
  if (!embeddingConfigured()) return [];
  try {
    const vector = await embed(keywords.join(" "));
    const chunks = await matchKnowledgeChunks(vector, KNOWLEDGE_CHUNK_COUNT, country);
    return chunks.map((c) => c.content);
  } catch (err) {
    logger.warn("Knowledge search failed — continuing without it", { error: err instanceof Error ? err.message : String(err) });
    return [];
  }
}

/** Best-effort cover: generate -> upload -> URL, or a note explaining why there is none.
 * Never throws — a cover problem must never fail the surrounding blog job. */
async function buildCover(article: GeneratedArticle): Promise<{ url: string | null; note: string | null }> {
  const prompt = `Editorial blog cover image for an article titled "${article.title}" about ${article.focus_keyword}. Clean, modern, study-abroad / international-education theme. No text overlay.`;
  const buffer = await generateCoverImage(prompt);
  if (!buffer) {
    return { url: null, note: process.env.HIGGSFIELD_API_KEY ? "cover: generation failed" : "cover: HIGGSFIELD_API_KEY not set" };
  }

  try {
    const storagePath = storage.buildPath("blog-posts", "covers", `${article.slug}.png`);
    await storage.uploadFile(storagePath, buffer, "image/png");
    return { url: `https://storage.googleapis.com/${config.GCS_BUCKET_NAME}/${storagePath}`, note: null };
  } catch (err) {
    logger.warn("Cover upload failed", { error: err instanceof Error ? err.message : String(err) });
    return { url: null, note: "cover: upload failed" };
  }
}

/** article.slug may collide with an existing post — suffix with the job id rather than fail the job. */
async function uniqueSlug(slug: string, jobId: number): Promise<string> {
  const clash = await postsRepo.findPostBySlug(slug);
  return clash ? `${slug}-${jobId}` : slug;
}

async function processJob(job: GenerationJobRow): Promise<void> {
  const keywords = job.keywords;
  const [knowledgeChunks, linkManifest] = await Promise.all([
    searchKnowledge(keywords, job.country),
    buildLinkManifest(),
  ]);

  const article = await generateArticle({
    keywords,
    context: job.context ?? undefined,
    topic: job.topic ?? undefined,
    country: job.country ?? undefined,
    knowledgeChunks,
    linkManifest,
  });

  const cover = await buildCover(article);
  const slug = await uniqueSlug(article.slug, job.id);

  const post = await postsRepo.insertPost({
    title: article.title,
    slug,
    excerpt: article.excerpt,
    content: article.content,
    category: job.topic ?? null,
    country_focus: job.country ?? null,
    tags: article.tags,
    author_name: "Globaly AI",
    author_avatar_url: null,
    cover_image_url: cover.url,
    og_image_url: cover.url,
    is_published: false,
    meta_title: article.meta_title,
    meta_description: article.meta_description,
    focus_keyword: article.focus_keyword,
    canonical_url: null,
    reading_time_minutes: article.reading_time_minutes,
    generated_by_ai: true,
  });

  await jobsRepo.markDone(job.id, post.id, cover.note);
  logger.info("Blog generation job complete", { jobId: job.id, blogPostId: post.id, cover: cover.note });
}

async function runJobSafely(job: Awaited<ReturnType<typeof jobsRepo.claimJob>> & object) {
  try {
    await processJob(job);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await jobsRepo.markFailed(job.id, message);
    logger.error("Blog generation job failed", { jobId: job.id, error: message });
  }
}

// ── Startup sweep ──
// The DB is the queue of record: createGeneration's publish is non-fatal, so jobs
// created while LavinMQ was down (or messages lost) sit `pending`. Drain them first.
let swept = 0;
for (;;) {
  const job = await jobsRepo.claimNextPending();
  if (!job) break;
  logger.info("Sweeping pending blog generation job", { jobId: job.id });
  await runJobSafely(job);
  swept++;
}
if (swept) logger.info(`Startup sweep processed ${swept} pending job(s)`);

// ── Consumer ──
// Live trigger path. When LavinMQ is unreachable, the sweep above already did the
// work — exit 0 like the cron-style workers instead of crashing.
try {
  await queueService.consume(BLOG_GENERATE_QUEUE, async (msg) => {
  let jobId: number;
  try {
    ({ jobId } = JSON.parse(msg!.content.toString()));
  } catch {
    logger.error("Malformed queue message, discarding", { raw: msg?.content.toString().slice(0, 200) });
    return;
  }
  if (!jobId) {
    logger.error("Queue message missing jobId, discarding");
    return;
  }

  const job = await jobsRepo.claimJob(jobId);
  if (!job) {
    logger.warn("Job already claimed, missing, or not pending — skipping", { jobId });
    return;
  }

  logger.info("Received blog generation job", { jobId });
  await runJobSafely(job);
  });
  logger.info(`Blog generation worker started — consuming "${BLOG_GENERATE_QUEUE}" queue`);
} catch (err) {
  logger.warn("LavinMQ unreachable — ran as a one-shot sweep; start LavinMQ for live consumption", {
    error: err instanceof Error ? err.message : String(err),
  });
  process.exit(0);
}
