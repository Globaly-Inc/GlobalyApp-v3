"use client";

import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Save, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Combobox } from "@/components/combobox";
import { FieldError } from "@/components/field-error";
import { ApiError, fieldErrorsFrom } from "@/lib/api/http";
import { useAppSelector } from "@/lib/hooks";
import { blogApi } from "../apis";
import { COUNTRY_OPTIONS, TOPIC_OPTIONS } from "../const";
import { calculateReadingTime, generateSlug } from "../utils";
import { BlogRichEditor } from "./blog-rich-editor";
import { BlogSeoPanel } from "./blog-seo-panel";
import type { BlogPost, BlogPostInput } from "../apis/types";

const empty = (): Partial<BlogPost> => ({
  title: "", slug: "", excerpt: "", content: "", category: null, country_focus: null, tags: [],
  author_name: null, author_avatar_url: null, cover_image_url: null, is_published: false,
  reading_time_minutes: 5, meta_title: null, meta_description: null, focus_keyword: null,
  seo_score: 0, canonical_url: null, og_image_url: null,
});

export function BlogEditorView({ postId }: Readonly<{ postId: number | null }>) {
  const router = useRouter();
  const me = useAppSelector((state) => state.admin.me);
  const [post, setPost] = useState<Partial<BlogPost>>(empty);
  const [loading, setLoading] = useState(postId !== null);
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [tagDraft, setTagDraft] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
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

  // New posts default the byline to whoever's logged in; the field stays editable from there.
  useEffect(() => {
    if (postId === null && me?.name) update({ author_name: me.name, author_avatar_url: me.photo_url ?? null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId, me?.name, me?.photo_url]);

  const update = (updates: Partial<BlogPost>) => setPost((p) => ({ ...p, ...updates }));

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

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (notFound) {
    return <p className="py-20 text-center text-sm text-muted-foreground">Post not found.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push("/admin/marketing/blog")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold text-foreground">{postId ? "Edit post" : "New post"}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-2" onClick={() => handleSave(false)} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save draft
          </Button>
          <Button className="gap-2" onClick={() => handleSave(true)} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {post.is_published ? "Update" : "Publish"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardContent className="space-y-4 pt-6">
              <div className="space-y-2">
                <Label htmlFor="post-title">
                  Title <span className="text-destructive">*</span>
                </Label>
                <Input id="post-title" className="h-10 text-base font-medium" value={post.title ?? ""} onChange={handleTitleChange} aria-invalid={!!errors.title} />
                <FieldError message={errors.title} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="post-slug">
                  Slug <span className="text-destructive">*</span>
                </Label>
                <Input id="post-slug" className="h-9" value={post.slug ?? ""} onChange={(e) => update({ slug: e.target.value })} aria-invalid={!!errors.slug} />
                <FieldError message={errors.slug} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="post-cover">Cover image</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="post-cover"
                    className="h-9"
                    placeholder="https://…"
                    value={post.cover_image_url ?? ""}
                    onChange={(e) => update({ cover_image_url: e.target.value || null })}
                    aria-invalid={!!errors.cover_image_url}
                  />
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleCoverUpload} />
                  <Button type="button" variant="outline" className="h-9 gap-1.5" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    Upload
                  </Button>
                </div>
                <FieldError message={errors.cover_image_url} />
                {post.cover_image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={post.cover_image_url} alt="" className="mt-2 h-32 w-full rounded-md object-cover" />
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="post-excerpt">Excerpt</Label>
                <Textarea id="post-excerpt" rows={3} value={post.excerpt ?? ""} onChange={(e) => update({ excerpt: e.target.value })} aria-invalid={!!errors.excerpt} />
                <FieldError message={errors.excerpt} />
              </div>

              <div className="space-y-2">
                <Label>Content</Label>
                <BlogRichEditor value={post.content ?? ""} onChange={handleContentChange} />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="sticky top-6 space-y-6 lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>Post settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="post-published">Published</Label>
                <Switch id="post-published" checked={!!post.is_published} onCheckedChange={(checked) => update({ is_published: checked })} />
              </div>

              <div className="space-y-2">
                <Label>Topic</Label>
                <Combobox value={post.category ?? ""} onChange={(v) => update({ category: v || null })} options={TOPIC_OPTIONS} placeholder="Select topic" />
              </div>

              <div className="space-y-2">
                <Label>Country focus</Label>
                <Combobox
                  value={post.country_focus ?? ""}
                  onChange={(v) => update({ country_focus: v || null })}
                  options={COUNTRY_OPTIONS}
                  placeholder="Select country"
                  creatable
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="post-tags">Tags</Label>
                <Input id="post-tags" className="h-9" placeholder="Type and press Enter" value={tagDraft} onChange={(e) => setTagDraft(e.target.value)} onKeyDown={handleAddTag} />
                {!!post.tags?.length && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {post.tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="gap-1">
                        {tag}
                        <button type="button" onClick={() => handleRemoveTag(tag)} aria-label={`Remove ${tag}`}>
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="post-author">Author</Label>
                  <Input id="post-author" className="h-9" value={post.author_name ?? ""} onChange={(e) => update({ author_name: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="post-reading-time">Reading time</Label>
                  <Input id="post-reading-time" className="h-9" disabled value={`${post.reading_time_minutes ?? 1} min`} />
                </div>
              </div>

              {post.creator_id != null && (
                <p className="text-xs text-muted-foreground">Created by admin #{post.creator_id} — this doesn&apos;t change when the byline is edited.</p>
              )}

              <div className="space-y-2">
                <Label htmlFor="post-canonical">Canonical URL</Label>
                <Input
                  id="post-canonical"
                  className="h-9"
                  value={post.canonical_url ?? ""}
                  onChange={(e) => update({ canonical_url: e.target.value || null })}
                  aria-invalid={!!errors.canonical_url}
                />
                <FieldError message={errors.canonical_url} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="post-og-image">OG image URL</Label>
                <Input
                  id="post-og-image"
                  className="h-9"
                  value={post.og_image_url ?? ""}
                  onChange={(e) => update({ og_image_url: e.target.value || null })}
                  aria-invalid={!!errors.og_image_url}
                />
                <FieldError message={errors.og_image_url} />
              </div>
            </CardContent>
          </Card>

          <BlogSeoPanel post={post} onChange={update} errors={errors} />
        </div>
      </div>
    </div>
  );
}
