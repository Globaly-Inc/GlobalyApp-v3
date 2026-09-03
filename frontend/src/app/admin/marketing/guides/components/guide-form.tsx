"use client";

import { useEffect, useState } from "react";
import { FileText, ImageIcon, Loader2, Video } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Combobox } from "@/components/combobox";
import { FieldError } from "@/components/field-error";
import { useAppDispatch } from "@/lib/hooks";
import { COUNTRY_OPTIONS } from "../../blog/const";
import { saveGuide } from "../store/guides-slice";
import type { Guide, GuideFiles, GuideInput } from "../apis/types";
import { generateSlug } from "../../blog/utils";

type BackgroundType = "image" | "video";

function toFormState(guide: Guide | null) {
  return {
    title: guide?.title ?? "",
    slug: guide?.slug ?? "",
    country: guide?.country ?? "",
    context: guide?.context ?? "",
    is_published: guide?.is_published ?? false,
  };
}

export function GuideForm({
  open,
  onOpenChange,
  guide,
}: Readonly<{ open: boolean; onOpenChange: (open: boolean) => void; guide: Guide | null }>) {
  const dispatch = useAppDispatch();
  const [form, setForm] = useState(toFormState(guide));
  const [slugTouched, setSlugTouched] = useState(false);
  const [backgroundType, setBackgroundType] = useState<BackgroundType>(guide?.background_video_url ? "video" : "image");
  const [files, setFiles] = useState<GuideFiles>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(toFormState(guide));
    setSlugTouched(false);
    setBackgroundType(guide?.background_video_url ? "video" : "image");
    setFiles({});
    setErrors({});
  }, [open, guide]);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "title" && !slugTouched) next.slug = generateSlug(value as string);
      return next;
    });
  }

  function validate(): Record<string, string> {
    const next: Record<string, string> = {};
    if (!form.title.trim()) next.title = "Title is required.";
    if (!form.slug.trim()) next.slug = "Slug is required.";
    return next;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validation = validate();
    setErrors(validation);
    if (Object.keys(validation).length > 0) return;

    const input: Partial<GuideInput> = {
      title: form.title.trim(),
      slug: form.slug.trim(),
      country: form.country || null,
      context: form.context || null,
      is_published: form.is_published,
    };
    // Explicitly clear whichever background field the toggle isn't pointed at, so switching
    // image -> video (or back) doesn't leave the old one set — the backend rejects both being set.
    if (backgroundType === "image") {
      input.background_video_url = null;
    } else {
      input.background_image_url = null;
    }

    setSaving(true);
    try {
      await dispatch(saveGuide({ id: guide?.id ?? null, input, files })).unwrap();
      toast.success(guide ? "Guide updated." : "Guide created.");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save guide.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{guide ? "Edit guide" : "New guide"}</DialogTitle>
        </DialogHeader>

        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="guide-title">Title</Label>
            <Input id="guide-title" value={form.title} onChange={(e) => update("title", e.target.value)} aria-invalid={!!errors.title} />
            <FieldError message={errors.title} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="guide-slug">Slug</Label>
            <Input
              id="guide-slug"
              value={form.slug}
              onChange={(e) => { setSlugTouched(true); update("slug", e.target.value); }}
              aria-invalid={!!errors.slug}
            />
            <FieldError message={errors.slug} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="guide-country">Country</Label>
            <Combobox
              id="guide-country"
              options={COUNTRY_OPTIONS}
              value={form.country}
              onChange={(v) => update("country", v)}
              placeholder="Select a country"
              creatable
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="guide-context">Context</Label>
            <Textarea
              id="guide-context"
              rows={4}
              value={form.context}
              onChange={(e) => update("context", e.target.value)}
              placeholder="A few lines shown on the landing page — hero excerpt and the &quot;What's inside&quot; section."
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Background</Label>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant={backgroundType === "image" ? "default" : "outline"}
                onClick={() => setBackgroundType("image")} className="gap-1.5">
                <ImageIcon className="h-3.5 w-3.5" /> Image
              </Button>
              <Button type="button" size="sm" variant={backgroundType === "video" ? "default" : "outline"}
                onClick={() => setBackgroundType("video")} className="gap-1.5">
                <Video className="h-3.5 w-3.5" /> Video
              </Button>
            </div>
            {backgroundType === "image" ? (
              <Input type="file" accept="image/*" onChange={(e) => setFiles((f) => ({ ...f, background_image: e.target.files?.[0] ?? null }))} />
            ) : (
              <Input type="file" accept="video/mp4,video/webm,video/quicktime" onChange={(e) => setFiles((f) => ({ ...f, background_video: e.target.files?.[0] ?? null }))} />
            )}
            {(guide?.background_image_url || guide?.background_video_url) && !files.background_image && !files.background_video && (
              <p className="text-xs text-muted-foreground">Current background kept unless you choose a new file.</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="guide-pdf">Guide PDF</Label>
            <Input id="guide-pdf" type="file" accept="application/pdf" onChange={(e) => setFiles((f) => ({ ...f, pdf: e.target.files?.[0] ?? null }))} />
            {guide?.pdf_url && !files.pdf && (
              <p className="inline-flex items-center gap-1 text-xs text-muted-foreground"><FileText className="h-3 w-3" /> A PDF is already uploaded — pick a file to replace it.</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="guide-cover">PDF cover image</Label>
            <Input id="guide-cover" type="file" accept="image/*" onChange={(e) => setFiles((f) => ({ ...f, pdf_cover_image: e.target.files?.[0] ?? null }))} />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
            <Label htmlFor="guide-published" className="cursor-pointer">Published</Label>
            <Switch id="guide-published" checked={form.is_published} onCheckedChange={(v) => update("is_published", v)} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Saving…</> : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
