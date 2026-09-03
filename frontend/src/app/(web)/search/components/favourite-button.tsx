"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Heart } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useSavedItems, type SavedItemType } from "../use-saved-items";

export function FavouriteButton({
  itemType, itemId,
}: Readonly<{ itemType: SavedItemType; itemId: string }>) {
  const { has, toggle, isSignedIn } = useSavedItems();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const isSaved = has(itemType, itemId);

  const onClick = async (e: React.MouseEvent) => {
    // The card is wrapped in a full-bleed overlay link — without this the click navigates away.
    e.preventDefault();
    e.stopPropagation();
    if (!isSignedIn) {
      router.push(`/auth/sign-in?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`);
      return;
    }
    setPending(true);
    try {
      await toggle(itemType, itemId);
    } catch {
      toast.error("Couldn't update your saved items");
    } finally {
      setPending(false);
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      aria-pressed={isSaved}
      aria-label={isSaved ? "Remove from saved" : "Save"}
      className="shrink-0 text-muted-foreground transition-colors hover:text-primary disabled:opacity-50"
    >
      <Heart className={cn("h-5 w-5", isSaved && "fill-primary text-primary")} />
    </button>
  );
}
