"use client";

import Link from "next/link";
import { AlertCircle, ExternalLink } from "lucide-react";
import { EMAIL_MATCH } from "../const";
import type { EmailMatch } from "../apis/types";

/** Why an invite was refused: each place the email already exists, linked where the admin has a page for it. */
export function EmailMatchesNotice({ matches }: Readonly<{ matches: EmailMatch[] }>) {
  return (
    <div role="alert" className="flex flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
      <p className="flex items-center gap-1.5 font-medium text-destructive">
        <AlertCircle className="h-4 w-4 shrink-0" /> This email already exists, so no invitation was sent.
      </p>
      <ul className="flex flex-col gap-1">
        {matches.map((m) => {
          const { label, href } = EMAIL_MATCH[m.kind];
          const url = href(m.id);
          return (
            <li key={`${m.kind}-${m.id}`} className="flex items-center justify-between gap-3">
              <span className="truncate">
                <span className="text-muted-foreground">{label}:</span> {m.name ?? "Unnamed"}
              </span>
              {url && (
                <Link href={url} target="_blank" className="flex shrink-0 items-center gap-1 text-primary hover:underline">
                  View <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
