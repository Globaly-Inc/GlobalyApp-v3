"use client";

import { useEffect, useState } from "react";
import { Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BusinessPatch, InstitutionPatch } from "../apis/types";

export type SocialMediaValues = {
  linkedin_url: string | null;
  facebook_url: string | null;
  instagram_url: string | null;
  twitter_url: string | null;
  youtube_url: string | null;
  whatsapp_url: string | null;
};

type FormState = Record<keyof SocialMediaValues, string>;

const FIELDS: { key: keyof SocialMediaValues; label: string; placeholder: string }[] = [
  { key: "linkedin_url", label: "LinkedIn", placeholder: "https://linkedin.com/company/..." },
  { key: "facebook_url", label: "Facebook", placeholder: "https://facebook.com/..." },
  { key: "instagram_url", label: "Instagram", placeholder: "https://instagram.com/..." },
  { key: "twitter_url", label: "Twitter / X", placeholder: "https://x.com/..." },
  { key: "youtube_url", label: "YouTube", placeholder: "https://youtube.com/..." },
];

function toForm(values: SocialMediaValues): FormState {
  return {
    linkedin_url: values.linkedin_url ?? "",
    facebook_url: values.facebook_url ?? "",
    instagram_url: values.instagram_url ?? "",
    twitter_url: values.twitter_url ?? "",
    youtube_url: values.youtube_url ?? "",
    whatsapp_url: values.whatsapp_url ?? "",
  };
}

export function SocialMediaDialog({
  open,
  onOpenChange,
  values,
  onSave,
  saving,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  values: SocialMediaValues;
  onSave: (patch: BusinessPatch | InstitutionPatch) => Promise<boolean>;
  saving: boolean;
}>) {
  const [form, setForm] = useState<FormState>(() => toForm(values));

  useEffect(() => {
    if (open) setForm(toForm(values));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, values]);

  const handleSubmit = async () => {
    const ok = await onSave({
      linkedin_url: form.linkedin_url || null,
      facebook_url: form.facebook_url || null,
      instagram_url: form.instagram_url || null,
      twitter_url: form.twitter_url || null,
      youtube_url: form.youtube_url || null,
      whatsapp_url: form.whatsapp_url || null,
    });
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Social Media</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {FIELDS.map(({ key, label, placeholder }) => (
            <div key={key} className="flex flex-col gap-2">
              <Label className="flex items-center gap-1.5">
                <Link2 className="h-3.5 w-3.5 text-muted-foreground" /> {label}
              </Label>
              <Input
                className="h-10"
                value={form[key]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                placeholder={placeholder}
              />
            </div>
          ))}
          <div className="flex flex-col gap-2">
            <Label>WhatsApp</Label>
            <Input
              className="h-10"
              value={form.whatsapp_url}
              onChange={(e) => setForm((f) => ({ ...f, whatsapp_url: e.target.value }))}
              placeholder="https://wa.me/..."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
