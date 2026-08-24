"use client";

import { useEffect } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FieldError } from "@/components/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useValidatedForm } from "@/lib/use-validated-form";
import type { BusinessProfile, SocialLinks } from "@/app/business/apis/types";

const PLATFORMS: { key: keyof SocialLinks; label: string; placeholder: string }[] = [
  { key: "linkedin_url", label: "LinkedIn", placeholder: "https://linkedin.com/company/..." },
  { key: "facebook_url", label: "Facebook", placeholder: "https://facebook.com/..." },
  { key: "instagram_url", label: "Instagram", placeholder: "https://instagram.com/..." },
  { key: "twitter_url", label: "Twitter / X", placeholder: "https://x.com/..." },
  { key: "youtube_url", label: "YouTube", placeholder: "https://youtube.com/@..." },
  { key: "tiktok_url", label: "TikTok", placeholder: "https://tiktok.com/@..." },
  { key: "whatsapp_url", label: "WhatsApp", placeholder: "https://wa.me/..." },
  { key: "threads_url", label: "Threads", placeholder: "https://threads.net/@..." },
  { key: "messenger_url", label: "Messenger", placeholder: "https://m.me/..." },
  { key: "telegram_url", label: "Telegram", placeholder: "https://t.me/..." },
  { key: "line_url", label: "Line", placeholder: "https://line.me/..." },
  { key: "viber_url", label: "Viber", placeholder: "https://viber.com/..." },
];

type FormState = Record<keyof SocialLinks, string>;

const urlOrEmpty = z.string().trim().refine((v) => v === "" || z.string().url().safeParse(v).success, "Enter a valid URL");
const schema: z.ZodType<FormState> = z.object(
  Object.fromEntries(PLATFORMS.map((p) => [p.key, urlOrEmpty])) as Record<keyof SocialLinks, typeof urlOrEmpty>,
);

function toForm(profile: SocialLinks): FormState {
  return Object.fromEntries(PLATFORMS.map((p) => [p.key, profile[p.key] ?? ""])) as FormState;
}

export function SocialLinksDialog({
  open,
  onOpenChange,
  profile,
  onSave,
  saving,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: BusinessProfile;
  onSave: (patch: Partial<SocialLinks>) => Promise<boolean>;
  saving: boolean;
}>) {
  const { form, setForm, errors, reset, validate } = useValidatedForm(schema, () => toForm(profile));

  useEffect(() => {
    if (open) reset(toForm(profile));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleSubmit = async () => {
    const data = validate();
    if (!data) return;
    const patch: Partial<SocialLinks> = {};
    for (const p of PLATFORMS) patch[p.key] = data[p.key] || null;
    const ok = await onSave(patch);
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto" style={{ maxWidth: "40rem" }}>
        <DialogHeader>
          <DialogTitle>Social links</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          {PLATFORMS.map((p) => (
            <div key={p.key} className="space-y-2">
              <Label htmlFor={`social-${p.key}`}>{p.label}</Label>
              <Input
                id={`social-${p.key}`}
                className="h-10"
                value={form[p.key]}
                onChange={(e) => setForm((f) => ({ ...f, [p.key]: e.target.value }))}
                aria-invalid={!!errors[p.key]}
                placeholder={p.placeholder}
              />
              <FieldError message={errors[p.key]} />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
