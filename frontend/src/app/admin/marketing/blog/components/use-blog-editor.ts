"use client";

import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ApiError, fieldErrorsFrom } from "@/lib/api/http";
import { useAppSelector } from "@/lib/hooks";
import { blogApi } from "../apis";
import { calculateReadingTime, generateSlug } from "../utils";
import type { BlogPost, BlogPostInput } from "../apis/types";

const empty = (): Partial<BlogPost> => ({
  title: "", slug: "", excerpt: "", content: "", category: null, country_focus: null, tags: [],
  author_name: null, author_avatar_url: null, cover_image_url: null, is_published: false,
  reading_time_minutes: 5, meta_title: null, meta_description: null, focus_keyword: null,
  seo_score: 0, canonical_url: null, og_image_url: null,
});

export function useBlogEditor(postId: number | null) {
  const router = useRouter();
  const me = useAppSelector((state) => state.admin.me);
  const [post, setPost] = useState<Partial<BlogPost>>(empty);
  const [loading, setLoading] = useState(postId !== null);
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [tagDraft, setTagDraft] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current || postId === null) return;
    fetchedRef.current = true;
    blogApi
      .getPostById(postId)
      .then(setPost)
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [postId]);

  const update = (updates: Partial<BlogPost>) => setPost((p) => ({ ...p, ...updates }));

  // New posts default the byline to whoever's logged in; the field stays editable from there.
  useEffect(() => {
    if (postId === null && me?.name) update({ author_name: me.name, author_avatar_url: me.photo_url ?? null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId, me?.name, me?.photo_url]);

  const handleTitleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const title = e.target.value;
    update({ title, ...(postId === null ? { slug: generateSlug(title) } : {}) });
  };

  const handleContentChange = (content: string) => {
    update({ content, reading_time_minutes: calculateReadingTime(content) });
  };

  const handleAddTag = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter" || !tagDraft.trim()) return;
    e.preventDefault();
    const tag = tagDraft.trim();
    if (!post.tags?.includes(tag)) update({ tags: [...(post.tags ?? []), tag] });
    setTagDraft("");
  };

  const handleRemoveTag = (tag: string) => update({ tags: (post.tags ?? []).filter((t) => t !== tag) });

  const handleCoverUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { url } = await blogApi.uploadCoverImage(file);
      update({ cover_image_url: url });
    } catch (err) {
      toast.error("Upload failed", { description: err instanceof Error ? err.message : "Please try again." });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const validate = () => {
    const next: typeof errors = {};
    if (!post.title?.trim()) next.title = "Title is required";
    if (!post.slug?.trim()) next.slug = "Slug is required";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSave = async (publish?: boolean) => {
    if (!validate()) return;
    setSaving(true);
    try {
      const input: BlogPostInput = {
        title: post.title!.trim(),
        slug: post.slug!.trim(),
        excerpt: post.excerpt || null,
        content: post.content || null,
        category: post.category ?? null,
        country_focus: post.country_focus ?? null,
        tags: post.tags ?? [],
        author_name: post.author_name || null,
        author_avatar_url: post.author_avatar_url || null,
        cover_image_url: post.cover_image_url || null,
        is_published: publish ?? post.is_published ?? false,
        meta_title: post.meta_title || null,
        meta_description: post.meta_description || null,
        focus_keyword: post.focus_keyword || null,
        canonical_url: post.canonical_url || null,
        og_image_url: post.og_image_url || null,
      };
      await (postId ? blogApi.updatePost(postId, input) : blogApi.createPost(input));
      toast.success(postId ? "Post updated" : "Post created");
      router.push("/admin/marketing/blog");
    } catch (err) {
      const fieldErrors = fieldErrorsFrom(err);
      // The only unique constraint on this table is slug, so a 409 always means "pick a different slug".
      if (err instanceof ApiError && err.code === "CONFLICT" && !fieldErrors.slug) fieldErrors.slug = err.message;

      if (Object.keys(fieldErrors).length > 0) {
        setErrors((e) => ({ ...e, ...fieldErrors }));
        toast.error("Some fields need attention", { description: "Fix the highlighted fields and try again." });
      } else {
        toast.error("Something went wrong", { description: err instanceof Error ? err.message : "Please try again." });
      }
    } finally {
      setSaving(false);
    }
  };

  return {
    router, post, loading, notFound, saving, uploading, tagDraft, setTagDraft, errors, preview, setPreview,
    fileInputRef, update, handleTitleChange, handleContentChange, handleAddTag, handleRemoveTag,
    handleCoverUpload, handleSave,
  };
}
