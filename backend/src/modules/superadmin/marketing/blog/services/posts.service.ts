import { ConflictError, NotFoundError } from "../../../../../shared/errors.js";
import * as repo from "../repositories/posts.repository.js";
import type { PostInput } from "../schemas/blog.schema.js";

export const listPosts = repo.listPosts;
export const countPosts = repo.countPosts;
export const findPostById = repo.findPostById;

async function requirePost(id: number) {
  const row = await repo.findPostById(id);
  if (!row) throw new NotFoundError("Blog post not found");
  return row;
}

// Same 10-check algorithm the editor UI previews live; this is the value actually persisted.
function calculateSeoScore(post: {
  title?: string | null;
  slug?: string | null;
  content?: string | null;
  focus_keyword?: string | null;
  meta_description?: string | null;
}): number {
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

  const checks = [
    !!focusKeyword && title.toLowerCase().includes(focusKeyword),
    !!focusKeyword && slug.toLowerCase().includes(focusKeyword),
    !!focusKeyword && intro.includes(focusKeyword),
    !!focusKeyword && density >= 0.5 && density <= 3,
    title.length >= 30 && title.length <= 60,
    (post.meta_description?.length ?? 0) >= 120 && (post.meta_description?.length ?? 0) <= 160,
    wordCount >= 300,
    /<h[2-6]/i.test(content),
    /<img/i.test(content),
    !!focusKeyword,
  ];
  const passed = checks.filter(Boolean).length;
  return Math.round((passed / checks.length) * 100);
}

function withComputedFields(data: Partial<PostInput>, existing?: { title?: string; slug?: string; content?: string | null }) {
  const merged = { ...existing, ...data };
  return { ...data, seo_score: calculateSeoScore(merged) };
}

export async function createPost(data: PostInput, creatorId: number | null) {
  const clash = await repo.findPostBySlug(data.slug);
  if (clash) throw new ConflictError("slug already exists");
  const payload: Record<string, unknown> = withComputedFields(data);
  payload.creator_id = creatorId;
  payload.views = 500;
  if (data.is_published) payload.published_at = new Date().toISOString();
  return repo.insertPost(payload);
}

export async function updatePost(id: number, data: Partial<PostInput>) {
  const existing = await requirePost(id);
  if (data.slug && data.slug !== existing.slug) {
    const clash = await repo.findPostBySlug(data.slug, id);
    if (clash) throw new ConflictError("slug already exists");
  }
  const payload: Record<string, unknown> = withComputedFields(data, existing);
  if (data.is_published && !existing.is_published) payload.published_at = new Date().toISOString();
  if (data.is_published === false) payload.published_at = null;
  return repo.updatePost(id, payload);
}

export async function deletePost(id: number) {
  await requirePost(id);
  await repo.deletePost(id);
}
