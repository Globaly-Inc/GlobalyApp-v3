"use client";

import { ArrowRight, Loader2, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EXTRACTION_CATEGORIES } from "../const";

/**
 * A bare domain is what people type, so it is what we accept: the protocol is added here rather
 * than demanded of them, and the crawl starts at the domain root whatever path was pasted.
 * Returns null for anything that isn't a website.
 */
export function crawlOrigin(value: string): string | null {
  const typed = value.trim();
  if (!typed) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(typed) ? typed : `https://${typed}`);
    return url.hostname.includes(".") ? url.origin : null;
  } catch {
    return null;
  }
}

/** Only the changes actually made, so the line never claims we tidied something we didn't. */
function whatWeChanged(typed: string): string | null {
  const raw = typed.trim();
  const added = !/^https?:\/\//i.test(raw);
  const hadPath = raw.replace(/^https?:\/\//i, "").replace(/\/+$/, "").includes("/");
  if (added && hadPath) return `You typed ${raw} — we added the protocol and kept it to the domain root.`;
  if (added) return `You typed ${raw} — we added the protocol for you.`;
  if (hadPath) return "We kept it to the domain root, so nothing underneath is missed.";
  return null;
}

/**
 * The last look before the crawl runs. This domain becomes the source for the whole profile and for
 * everything the assistant later says, so it is shown back resolved — not as it was typed — with
 * what will be collected and what we will and won't fetch.
 */
export function ConfirmCrawlDialog({
  open, onOpenChange, typed, starting, onConfirm,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The raw field value; the dialog resolves it itself, so the two can't drift apart. */
  typed: string;
  starting: boolean;
  onConfirm: (origin: string) => void;
}>) {
  const origin = crawlOrigin(typed);
  if (!origin) return null;
  const changed = whatWeChanged(typed);
  const host = origin.replace(/^https?:\/\//, "");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[35rem] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">Ready to read your website?</DialogTitle>
          <DialogDescription>
            Check this is the site your courses live on — it becomes the source for your whole profile, and for
            everything your AI assistant says.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="rounded-xl border bg-muted/40 p-3.5">
            <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">We will crawl</p>
            <p className="mt-1 text-sm font-medium break-all">{origin}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              and every public page underneath it.{changed ? ` ${changed}` : ""}
            </p>
          </div>

          <div>
            <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">We&apos;ll collect</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {EXTRACTION_CATEGORIES.map((c) => (
                <Badge key={c} variant="outline" className="font-normal">{c}</Badge>
              ))}
            </div>
          </div>

          <p className="text-xs leading-5 text-muted-foreground">
            It runs on its own — close the tab if you like, we&apos;ll email you when it&apos;s done. Once it starts,
            this is the site your profile is built from; changing it afterwards needs our help, so check the
            spelling now.
          </p>

          <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            We read your robots.txt to find your sitemaps, and only ever fetch pages that are already public.
          </p>
        </div>

        <DialogFooter className="-mx-6 -mb-6 mt-1 items-center gap-2 rounded-b-2xl border-t bg-muted/30 px-6 py-4 sm:justify-end">
          <Button type="button" variant="outline" className="cursor-pointer" disabled={starting} onClick={() => onOpenChange(false)}>
            Change the website
          </Button>
          <Button type="button" className="cursor-pointer gap-2" disabled={starting} onClick={() => onConfirm(origin)}>
            {starting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {starting ? "Starting…" : `Start reading ${host}`}
            {!starting && <ArrowRight className="h-4 w-4" aria-hidden />}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
