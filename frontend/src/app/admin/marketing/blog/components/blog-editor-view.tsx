"use client";

import { Eye, Loader2, Pencil, Save } from "lucide-react";
import { BackButton } from "@/components/ui/back-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
import { BlogEditorCanvas } from "./blog-editor-canvas";
import { BlogPostSettings } from "./blog-post-settings";
import { BlogSeoPanel } from "./blog-seo-panel";
import { useBlogEditor } from "./use-blog-editor";

export function BlogEditorView({ postId }: Readonly<{ postId: number | null }>) {
  const editor = useBlogEditor(postId);
  const { router, post, loading, notFound, saving, errors, preview, setPreview, update, handleSave } = editor;

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
    <PageBody>
      <PageHeader
        leading={<BackButton onClick={() => router.push("/admin/marketing/blog")} label="Back to posts" />}
        title={postId ? "Edit post" : "New post"}
        badges={post.is_published ? <Badge variant="success">Published</Badge> : <Badge variant="secondary">Draft</Badge>}
      >
        <Button variant="outline" className="gap-2" onClick={() => setPreview((p) => !p)}>
          {preview ? <Pencil className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          {preview ? "Edit" : "Preview"}
        </Button>
        <Button variant="secondary" className="gap-2" onClick={() => handleSave(false)} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save draft
        </Button>
        <Button className="gap-2" onClick={() => handleSave(true)} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {post.is_published ? "Update" : "Publish"}
        </Button>
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <BlogEditorCanvas editor={editor} />
        </div>
        <div className="flex min-w-0 flex-col gap-4 md:gap-6">
          <BlogPostSettings editor={editor} />
          <BlogSeoPanel post={post} onChange={update} errors={errors} />
        </div>
      </div>
    </PageBody>
  );
}
