"use client";

import { useState } from "react";
import { ChevronRight, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { SIDEBAR_LABEL } from "./const";
import { ConversationRow } from "./conversation-row";
import type { ChatThread } from "./types";
import type { ActiveView } from "./ui-types";

/**
 * The FAVORITES section from GlobalyOS V2's `FavoritesSection`: a collapsible header
 * with a chevron and an orange filled star, then the pinned conversations as compact
 * rows. Renders nothing at all when there are no favorites, exactly as V2 does — an
 * empty section header is noise.
 *
 * In V2 a favorite is a **conversation or space** (`chat_favorites`, one row per user
 * per target, with a `sort_order`), toggled from the conversation's own header or its
 * sidebar menu. Mapped here to a favorited THREAD (`enquiry_thread_states.favorited_at`),
 * toggled from the same two places.
 *
 * ponytail: ordered by when it was pinned, not drag-reorderable. V2's arrange mode needs
 * @dnd-kit, which is not in this project — add it (and a sort_order column) only if
 * someone actually asks to reorder.
 */
export function FavoritesSection({
  favorites,
  active,
  onOpen,
  onToggleFavorite,
}: Readonly<{
  favorites: ChatThread[];
  active: ActiveView;
  onOpen: (distributionId: string) => void;
  onToggleFavorite: (distributionId: string) => void;
}>) {
  const [expanded, setExpanded] = useState(true);

  if (favorites.length === 0) return null;

  return (
    <div className="px-3 py-3">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className={cn(SIDEBAR_LABEL, "mb-2 flex cursor-pointer items-center gap-1.5 px-2 transition-colors hover:text-foreground")}
      >
        <ChevronRight className={cn("size-3 transition-transform", expanded && "rotate-90")} aria-hidden />
        <Star className="size-3 fill-orange-500 text-orange-500" aria-hidden />
        Favorites
      </button>

      {expanded && (
        <div className="space-y-0.5">
          {favorites.map((thread) => (
            <ConversationRow
              key={thread.distribution_id}
              thread={thread}
              compact
              isActive={active.type === "conversation" && active.id === thread.distribution_id}
              onOpen={() => onOpen(thread.distribution_id)}
              onToggleFavorite={() => onToggleFavorite(thread.distribution_id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
