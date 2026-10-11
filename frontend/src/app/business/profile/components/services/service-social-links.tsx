"use client";

import { Link2 } from "lucide-react";
import { SocialIcon, socialNameForUrl } from "@/app/(web)/components/social-icon";

/** The org's own social profiles as small round icon links. Inline (spans), so it can sit in a subtitle. */
export function ServiceSocialLinks({ urls }: Readonly<{ urls: string[] }>) {
  if (urls.length === 0) return null;
  return (
    <span className="inline-flex items-center gap-1.5">
      {urls.map((url) => {
        const brand = socialNameForUrl(url);
        return (
          <a key={url} href={url} target="_blank" rel="noopener noreferrer" title={brand ? brand.charAt(0).toUpperCase() + brand.slice(1) : url} aria-label={brand ?? url}
            className="flex size-7 items-center justify-center rounded-full border text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary">
            {brand ? <SocialIcon name={brand} className="size-3.5" /> : <Link2 className="size-3.5" />}
          </a>
        );
      })}
    </span>
  );
}
