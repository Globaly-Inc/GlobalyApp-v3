"use client";

import { createPortal } from "react-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { mentionDisplayName } from "../utils/mentions";
import type { MentionCandidate } from "../apis/types";

export function MentionDropdown({
  matches,
  rect,
  onPick,
}: Readonly<{
  matches: MentionCandidate[];
  rect: { top: number; left: number; width: number } | null;
  onPick: (candidate: MentionCandidate) => void;
}>) {
  if (matches.length === 0 || !rect || typeof document === "undefined") return null;

  return createPortal(
    <div
      style={{ position: "fixed", top: rect.top, left: rect.left, width: rect.width }}
      className="z-50 rounded-lg border border-border bg-popover p-1 shadow-md"
    >
      {matches.map((candidate) => (
        <button
          key={candidate.platform_user_id}
          type="button"
          onClick={() => onPick(candidate)}
          className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
        >
          <Avatar className="size-5">
            {candidate.photo_url && <AvatarImage src={candidate.photo_url} alt="" />}
            <AvatarFallback className="text-[9px]">
              {`${candidate.first_name?.[0] ?? ""}${candidate.last_name?.[0] ?? ""}`.toUpperCase() || "U"}
            </AvatarFallback>
          </Avatar>
          <span className="truncate">{mentionDisplayName(candidate)}</span>
        </button>
      ))}
    </div>,
    document.body,
  );
}
