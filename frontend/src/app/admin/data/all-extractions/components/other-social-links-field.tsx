"use client";

import { useState } from "react";
import { Link2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type SocialLink = { label: string; url: string };

export type OtherSocialLinksFieldProps = Readonly<{
  value: SocialLink[] | null;
  onSave: (next: SocialLink[]) => Promise<unknown>;
}>;

/** Free-form list of social/profile links that don't fit a known platform column (TikTok,
 * Threads, WhatsApp Business, a booking page, ...) — each with a title the LLM guessed from
 * the platform, or one an admin types in manually. Every add/remove saves the whole array
 * immediately, same as any other field on this tab. */
export function OtherSocialLinksField({ value, onSave }: OtherSocialLinksFieldProps) {
  const links = value ?? [];
  const [draftLabel, setDraftLabel] = useState("");
  const [draftUrl, setDraftUrl] = useState("");
  const [saving, setSaving] = useState(false);

  const addLink = async () => {
    const url = draftUrl.trim();
    const label = draftLabel.trim();
    if (!url || !label || links.some((l) => l.url === url)) return;
    setSaving(true);
    try {
      await onSave([...links, { label, url }]);
      setDraftLabel("");
      setDraftUrl("");
    } finally {
      setSaving(false);
    }
  };

  const removeLink = async (url: string) => {
    setSaving(true);
    try {
      await onSave(links.filter((l) => l.url !== url));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/20 p-2 md:col-span-2">
      <div className="flex items-center gap-2.5">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Link2 className="h-3.5 w-3.5" />
        </div>
        <span className="text-xs text-muted-foreground">Other links</span>
      </div>

      {links.length > 0 && (
        <ul className="flex flex-col gap-1">
          {links.map((link) => (
            <li key={link.url} className="flex items-center justify-between gap-2 rounded-md bg-background px-2 py-1 text-sm">
              <div className="min-w-0">
                <span className="mr-1.5 font-medium">{link.label}</span>
                <a href={link.url} target="_blank" rel="noopener noreferrer" className="truncate text-primary hover:underline">
                  {link.url}
                </a>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                className="shrink-0 cursor-pointer"
                disabled={saving}
                onClick={() => removeLink(link.url)}
                aria-label={`Remove ${link.label}`}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2">
        <Input
          value={draftLabel}
          onChange={(e) => setDraftLabel(e.target.value)}
          placeholder="Title, e.g. TikTok"
          className="h-9 w-32 shrink-0"
          disabled={saving}
        />
        <Input
          value={draftUrl}
          onChange={(e) => setDraftUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addLink()}
          placeholder="https://tiktok.com/@institution"
          className="h-9"
          disabled={saving}
        />
        <Button
          variant="outline" size="sm" className="shrink-0 cursor-pointer"
          disabled={saving || !draftLabel.trim() || !draftUrl.trim()}
          onClick={addLink}
        >
          <Plus className="h-3.5 w-3.5" />
          Add
        </Button>
      </div>
    </div>
  );
}
