"use client";

import Link from "next/link";
import { Heart } from "lucide-react";
import { useSavedItems } from "../use-saved-items";

/**
 * The Saved pill in the right zone of the tab bar. Client-side because both the signed-in check
 * and the count live in the browser session — V1 hid this entirely for signed-out visitors.
 */
export function SavedTabButton({
  active, basePath = "/search",
}: Readonly<{ active: boolean; basePath?: string }>) {
  const { count, isSignedIn } = useSavedItems();
  if (!isSignedIn) return null;

  return (
    <div className="ml-1 flex flex-shrink-0 items-center border-l border-border pl-3">
      <Link
        href={`${basePath}?tab=saved`}
        scroll={false}
        className={`flex flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition-all ${
          active
            ? "bg-destructive/10 text-destructive"
            : "bg-muted text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        }`}
      >
        <Heart className={`h-3.5 w-3.5 ${active ? "fill-current" : ""}`} />
        Saved
        {count > 0 && (
          <span className="rounded-full bg-destructive/10 px-1.5 py-0.5 text-xs font-normal leading-none text-destructive">
            {count}
          </span>
        )}
      </Link>
    </div>
  );
}
