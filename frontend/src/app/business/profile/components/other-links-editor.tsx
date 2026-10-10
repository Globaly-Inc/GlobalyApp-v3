"use client";

import { useState } from "react";
import { Link2, Plus, X } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/field-error";
import { SocialIcon, socialNameForUrl } from "@/app/(web)/components/social-icon";
import type { OtherSocialLink } from "@/app/business/apis/types";

const isUrl = (v: string) => z.string().url().safeParse(v).success;

/** Labelled links beyond the fixed platforms (Weibo, Medium, Bluesky…) — edited locally; the
 * Social links dialog saves the list with everything else. */
export function OtherLinksEditor({
  links, onChange,
}: Readonly<{ links: OtherSocialLink[]; onChange: (next: OtherSocialLink[]) => void }>) {
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  const add = () => {
    const l = label.trim();
    const u = url.trim();
    if (!l) return setError("Add a title, e.g. Weibo");
    if (!isUrl(u)) return setError("Enter a valid URL");
    if (links.some((x) => x.url === u)) return setError("That link is already added");
    onChange([...links, { label: l, url: u }]);
    setLabel("");
    setUrl("");
    setError(null);
  };

  return (
    <div className="col-span-2 flex flex-col gap-2">
      <Label>Other links</Label>
      {links.length > 0 && (
        <ul className="flex flex-col gap-1">
          {links.map((link) => {
            const brand = socialNameForUrl(link.url);
            return (
              <li key={link.url} className="flex items-center gap-2 rounded-md border bg-muted/30 px-2.5 py-1.5 text-sm">
                {brand ? <SocialIcon name={brand} className="h-4 w-4 shrink-0" /> : <Link2 className="h-4 w-4 shrink-0" />}
                <span className="shrink-0 font-medium">{link.label}</span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{link.url}</span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${link.label}`}
                  onClick={() => onChange(links.filter((x) => x.url !== link.url))}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex gap-2">
        <Input className="h-10 w-36" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Title, e.g. Weibo" />
        <Input
          className="h-10 flex-1"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder="https://weibo.com/..."
        />
        <Button variant="outline" className="h-10 gap-1" onClick={add}>
          <Plus className="h-3.5 w-3.5" /> Add
        </Button>
      </div>
      <FieldError message={error ?? undefined} />
    </div>
  );
}
