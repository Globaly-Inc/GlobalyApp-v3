"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

/** "The University of Melbourne" → "UM". Stopwords are dropped so every card
 * doesn't fall back to a wall of "TU". */
const SKIP = new Set(["the", "of", "for", "and", "at", "de", "la"]);

function monogram(name: string): string {
  const words = name
    .split(/[\s-]+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter((w) => w && !SKIP.has(w.toLowerCase()));
  const first = words[0];
  if (!first) return "?";
  return (first[0] + (words[1]?.[0] ?? "")).toUpperCase();
}

/**
 * Institution logo with a monogram fallback. Logos are arbitrary partner-domain
 * URLs from the extraction pipeline, so this stays a plain `<img>` (via Avatar)
 * rather than next/image — no remotePatterns entry to keep in sync.
 */
export function InstitutionLogo({
  name,
  logoUrl,
  className,
}: {
  name: string;
  logoUrl: string | null | undefined;
  className?: string;
}) {
  return (
    <Avatar
      className={cn(
        "size-11 rounded-xl bg-background shadow-sm ring-1 ring-border/70",
        className,
      )}
    >
      {logoUrl && (
        <AvatarImage
          src={logoUrl}
          alt={name}
          // contain, not cover: wordmarks are wide and get beheaded by cover.
          className="aspect-auto object-contain p-1"
        />
      )}
      <AvatarFallback className="rounded-xl bg-primary/10 text-xs font-semibold text-primary">
        {monogram(name)}
      </AvatarFallback>
    </Avatar>
  );
}
