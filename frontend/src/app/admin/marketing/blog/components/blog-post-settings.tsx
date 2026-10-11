"use client";

import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Combobox } from "@/components/combobox";
import { COUNTRY_OPTIONS, TOPIC_OPTIONS } from "../const";
import type { useBlogEditor } from "./use-blog-editor";

type Editor = ReturnType<typeof useBlogEditor>;

/** Side-panel "Post settings" card. flex + gap rather than space-y — it holds Comboboxes (see AGENTS.md). */
export function BlogPostSettings({ editor }: Readonly<{ editor: Editor }>) {
  const { post, errors, update, tagDraft, setTagDraft, handleAddTag, handleRemoveTag } = editor;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Post settings</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="post-published">Published</Label>
          <Switch id="post-published" checked={!!post.is_published} onCheckedChange={(checked) => update({ is_published: checked })} />
        </div>

        <FormField label="Topic">
          <Combobox value={post.category ?? ""} onChange={(v) => update({ category: v || null })} options={TOPIC_OPTIONS} placeholder="Select topic" />
        </FormField>

        <FormField label="Country focus">
          <Combobox
            value={post.country_focus ?? ""}
            onChange={(v) => update({ country_focus: v || null })}
            options={COUNTRY_OPTIONS}
            placeholder="Select country"
            creatable
          />
        </FormField>

        <FormField label="Tags" htmlFor="post-tags">
          <Input id="post-tags" className="h-9" placeholder="Type and press Enter" value={tagDraft} onChange={(e) => setTagDraft(e.target.value)} onKeyDown={handleAddTag} />
          {!!post.tags?.length && (
            <div className="flex flex-wrap gap-1.5">
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
        </FormField>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Author" htmlFor="post-author">
            <Input id="post-author" className="h-9" value={post.author_name ?? ""} onChange={(e) => update({ author_name: e.target.value })} />
          </FormField>
          <FormField label="Reading time" htmlFor="post-reading-time">
            <Input id="post-reading-time" className="h-9" disabled value={`${post.reading_time_minutes ?? 1} min`} />
          </FormField>
        </div>

        {post.creator_id != null && (
          <p className="text-xs text-muted-foreground">Created by admin #{post.creator_id} — this doesn&apos;t change when the byline is edited.</p>
        )}

        <FormField label="Canonical URL" htmlFor="post-canonical" error={errors.canonical_url}>
          <Input
            id="post-canonical"
            className="h-9"
            value={post.canonical_url ?? ""}
            onChange={(e) => update({ canonical_url: e.target.value || null })}
            aria-invalid={!!errors.canonical_url}
          />
        </FormField>

        <FormField label="OG image URL" htmlFor="post-og-image" error={errors.og_image_url}>
          <Input
            id="post-og-image"
            className="h-9"
            value={post.og_image_url ?? ""}
            onChange={(e) => update({ og_image_url: e.target.value || null })}
            aria-invalid={!!errors.og_image_url}
          />
        </FormField>
      </CardContent>
    </Card>
  );
}
