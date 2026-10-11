"use client";

import DOMPurify from "dompurify";
import { Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { BlogRichEditor } from "./blog-rich-editor";
import type { useBlogEditor } from "./use-blog-editor";

type Editor = ReturnType<typeof useBlogEditor>;

/** The read-only article as it'll render on the site — content stays DOMPurify-sanitized. */
function BlogPostPreview({ post }: Readonly<{ post: Editor["post"] }>) {
  return (
    <article className="mx-auto w-full max-w-180 px-4 py-8 sm:px-8">
      {post.cover_image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={post.cover_image_url} alt="" className="mb-6 h-64 w-full rounded-lg object-cover" />
      )}
      <h1 className="mb-4 font-heading text-3xl font-medium tracking-[-0.025em] text-foreground">{post.title || "Untitled"}</h1>
      {post.excerpt && <p className="mb-6 text-lg text-muted-foreground">{post.excerpt}</p>}
      <div
        className="prose prose-sm md:prose-base max-w-none text-foreground
          prose-headings:text-foreground prose-headings:font-bold
          prose-p:text-foreground prose-p:leading-relaxed
          prose-a:text-primary prose-a:no-underline hover:prose-a:underline
          prose-blockquote:border-l-primary prose-blockquote:text-muted-foreground
          prose-strong:text-foreground prose-code:text-primary
          prose-img:rounded-lg prose-img:mx-auto"
        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(post.content || "<p>No content yet.</p>") }}
      />
    </article>
  );
}

function BlogPostFields({ editor }: Readonly<{ editor: Editor }>) {
  const { post, errors, update, uploading, fileInputRef, handleTitleChange, handleCoverUpload } = editor;
  return (
    <div className="grid grid-cols-1 gap-4 border-b border-border p-5 sm:grid-cols-2">
      <FormField label="Title" htmlFor="post-title" required error={errors.title} wide>
        <Input id="post-title" className="h-10 text-base font-medium" value={post.title ?? ""} onChange={handleTitleChange} aria-invalid={!!errors.title} />
      </FormField>

      <FormField label="Slug" htmlFor="post-slug" required error={errors.slug}>
        <Input id="post-slug" className="h-9 font-mono" value={post.slug ?? ""} onChange={(e) => update({ slug: e.target.value })} aria-invalid={!!errors.slug} />
      </FormField>

      <FormField label="Cover image" htmlFor="post-cover" error={errors.cover_image_url}>
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
      </FormField>

      {post.cover_image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={post.cover_image_url} alt="" className="h-32 w-full rounded-md object-cover sm:col-span-full" />
      )}

      <FormField label="Excerpt" htmlFor="post-excerpt" error={errors.excerpt} wide>
        <Textarea id="post-excerpt" rows={3} value={post.excerpt ?? ""} onChange={(e) => update({ excerpt: e.target.value })} aria-invalid={!!errors.excerpt} />
      </FormField>
    </div>
  );
}

/** Editor.dc.html main column: post fields on top, then the toolbar + writing canvas — or the preview. */
export function BlogEditorCanvas({ editor }: Readonly<{ editor: Editor }>) {
  const { post, preview, handleContentChange } = editor;
  return (
    <Card className="gap-0 py-0">
      {preview ? (
        <BlogPostPreview post={post} />
      ) : (
        <>
          <BlogPostFields editor={editor} />
          <div>
            <p className="px-5 pt-4 pb-2 text-sm font-medium text-foreground">Content</p>
            <BlogRichEditor value={post.content ?? ""} onChange={handleContentChange} />
          </div>
        </>
      )}
    </Card>
  );
}
