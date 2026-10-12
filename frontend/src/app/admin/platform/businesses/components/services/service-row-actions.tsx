"use client";

import { Eye, EyeOff, FileText, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** One ⋯ menu per service row instead of a strip of icons. View is always there (a claimed org is
 *  read-only but still viewable); Edit and Delete only when the org can be edited here. */
export function ServiceRowActions({
  editHref, isPublished, readOnly, onTogglePublish, onDelete,
}: Readonly<{
  editHref: string;
  isPublished: boolean;
  readOnly: boolean;
  onTogglePublish: () => void;
  onDelete: () => void;
}>) {
  const router = useRouter();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Service actions"
        className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      >
        <MoreVertical className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onClick={() => router.push(`${editHref}?view=1`)}>
          <FileText className="h-4 w-4" /> View
        </DropdownMenuItem>
        {!readOnly && (
          <DropdownMenuItem onClick={() => router.push(editHref)}>
            <Pencil className="h-4 w-4" /> Edit
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={onTogglePublish}>
          {isPublished ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          {isPublished ? "Unpublish" : "Publish"}
        </DropdownMenuItem>
        {!readOnly && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
              <Trash2 className="h-4 w-4" /> Delete
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
