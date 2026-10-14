"use client";

import { cn } from "@/lib/utils";
import { POST_TYPE_STYLES, POST_TYPES } from "../const";

export function FeedComposerPostTypes({
  postType,
  setPostType,
}: Readonly<{
  postType: string;
  setPostType: (value: string) => void;
}>) {
  return (
    <>
      {POST_TYPES.map((type) => {
        const style = POST_TYPE_STYLES[type.value];
        const active = postType === type.value;
        return (
          <button
            key={type.value}
            type="button"
            onClick={() => setPostType(type.value)}
            className={cn(
              "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              active ? cn("border-transparent", style?.badge) : "border-border text-muted-foreground hover:bg-muted",
            )}
          >
            <type.icon className="h-3.5 w-3.5" />
            {type.label}
          </button>
        );
      })}
    </>
  );
}
