"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * "Ask a question" — back to the counsellor, as the SAME visitor.
 *
 * This page is a top-level tab opened out of a third-party iframe, so it holds none of the
 * panel's storage: a plain link to /embed/<key> would mint a new fingerprint and open an empty
 * thread, which reads as the conversation having been lost. The card hands the id over in the
 * hash (see CourseCard), the same channel embed.js uses and the one `getFingerprint` already
 * adopts; this carries it one hop further.
 *
 * Client-side because a hash never reaches the server — the page itself cannot see it, and
 * reading it after mount keeps the markup identical between server and client.
 */
export function AskAgainLink({ embedKey }: Readonly<{ embedKey: string }>) {
  const [href, setHref] = useState(`/embed/${embedKey}`);

  useEffect(() => {
    const fp = new URLSearchParams(window.location.hash.slice(1)).get("fp");
    if (fp) setHref(`/embed/${embedKey}#fp=${encodeURIComponent(fp)}`);
  }, [embedKey]);

  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-primary-foreground hover:bg-white/15 hover:text-primary-foreground"
      render={<Link href={href} />}
    >
      <MessageCircle className="size-4" />
      Ask a question
    </Button>
  );
}
