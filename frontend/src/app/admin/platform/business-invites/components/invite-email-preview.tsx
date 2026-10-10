"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { businessInvitesApi } from "../apis";
import type { InvitePreview } from "../apis/types";

/**
 * The mail itself, not a description of it: the API composes it with the same function the send
 * uses, so what the admin reads here is what the recipient gets. Fetched only once the disclosure
 * is opened — most sends never need it — and again when the name or category changes, since both
 * of those appear in the mail.
 */
export function InviteEmailPreview({ categoryId, name }: Readonly<{ categoryId: number | null; name: string }>) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<{ for: string; preview: InvitePreview | null; failed: boolean }>({ for: "", preview: null, failed: false });

  // Keyed by what was asked for, so an edited name shows its skeleton again instead of the
  // previous name's mail, and the effect never has to clear state on the way in.
  const key = `${categoryId ?? ""}|${name.trim()}`;
  const current = state.for === key ? state : null;

  useEffect(() => {
    if (!open || !categoryId) return;
    let live = true;
    const timer = setTimeout(() => {
      businessInvitesApi
        .previewInvite({ business_category_id: categoryId, name: name.trim() || undefined })
        .then((preview) => live && setState({ for: key, preview, failed: false }))
        .catch(() => live && setState({ for: key, preview: null, failed: true }));
    }, 300);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [open, categoryId, name, key]);

  return (
    <details className="group rounded-xl border bg-muted/40" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3.5 text-xs font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
        Preview the email they&apos;ll get
        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
      </summary>

      <div className="flex flex-col gap-2 border-t px-3.5 py-3">
        <span className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Subject</span>
        {current?.preview ? <span className="text-sm">{current.preview.subject}</span> : <Skeleton className="h-5 w-3/4" />}

        {current?.failed ? (
          <p className="text-xs text-muted-foreground">Couldn&apos;t load the preview — it doesn&apos;t stop you sending.</p>
        ) : (
          // Sandboxed with no permissions at all: it is mail markup, and it belongs in its own page
          // rather than inheriting the dialog's styles.
          <iframe
            title="The invitation email"
            srcDoc={current?.preview?.html ?? ""}
            sandbox=""
            className="h-80 w-full rounded-lg border bg-white"
          />
        )}
      </div>
    </details>
  );
}
