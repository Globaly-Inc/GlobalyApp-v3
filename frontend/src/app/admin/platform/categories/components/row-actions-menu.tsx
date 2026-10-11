"use client";

import { CheckCircle2, MoreHorizontal, Pencil, Trash2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ModerationStatus } from "../apis/types";

/**
 * Last-column actions for moderated rows (fee types, accreditations): Edit stays a visible button; review
 * decisions, any extra items and Delete sit in the "…" menu.
 */
export function ModeratedRowActions({
  name, pending, onReview, onEdit, onDelete, extraItems,
}: Readonly<{
  name: string;
  pending: boolean;
  onReview: (decision: ModerationStatus) => void;
  onEdit: () => void;
  onDelete: () => void;
  extraItems?: React.ReactNode;
}>) {
  return (
    <div className="flex items-center justify-end gap-1.5">
      <Button variant="ghost" size="icon-sm" aria-label={`Edit ${name}`} onClick={onEdit}>
        <Pencil />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`More actions for ${name}`}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground"
        >
          <MoreHorizontal className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {pending && (
            <>
              <DropdownMenuItem onClick={() => onReview("approved")}>
                <CheckCircle2 className="mr-2 h-4 w-4 text-success" /> Approve
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onReview("rejected")}>
                <XCircle className="mr-2 h-4 w-4 text-destructive" /> Reject
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          {extraItems}
          <DropdownMenuItem className="text-destructive" onClick={onDelete}>
            <Trash2 className="mr-2 h-4 w-4" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
