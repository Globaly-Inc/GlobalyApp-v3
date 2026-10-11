import { ImageOff, Pencil, Sparkles, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import type { BlogPost } from "../apis/types";

/** Column headers for the rows below — kept beside the row so the two can't drift apart. */
export const BLOG_POST_COLUMNS = [
  { label: "Post" },
  { label: "Status" },
  { label: "SEO", className: "hidden md:table-cell" },
  { label: "Reading time", className: "hidden lg:table-cell" },
  { label: "Views", className: "hidden lg:table-cell", numeric: true },
  { label: "Updated", className: "hidden md:table-cell" },
  { label: "Actions", className: "w-px", srOnly: true },
] as const;

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function BlogPostRow({ post, onEdit, onDelete }: Readonly<{ post: BlogPost; onEdit: () => void; onDelete: () => void }>) {
  return (
    <TableRow>
      <TableCell primary>
        <div className="flex min-w-0 items-center gap-3">
          <div className="size-10 shrink-0 overflow-hidden rounded-md bg-muted">
            {post.cover_image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={post.cover_image_url} alt="" className="size-full object-cover" />
            ) : (
              <div className="flex size-full items-center justify-center text-muted-foreground">
                <ImageOff className="size-4" aria-hidden />
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{post.title}</p>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              {post.category && <Badge variant="outline">{post.category}</Badge>}
              {post.generated_by_ai && !post.is_published && (
                <Badge variant="info"><Sparkles /> AI generated — needs review</Badge>
              )}
              {post.author_name && <span className="truncate">{post.author_name}</span>}
            </div>
            {/* Fallbacks for the columns hidden on narrow screens. */}
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground lg:hidden">
              <span className="md:hidden">SEO {post.seo_score ?? "—"}</span>
              <span>{post.reading_time_minutes} min</span>
              <span>{post.views} views</span>
              <span className="md:hidden">Updated {formatDate(post.updated_at)}</span>
            </div>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <Badge variant={post.is_published ? "success" : "secondary"}>{post.is_published ? "Published" : "Draft"}</Badge>
      </TableCell>
      <TableCell className="hidden text-muted-foreground md:table-cell">{post.seo_score ?? "—"}</TableCell>
      <TableCell className="hidden text-muted-foreground lg:table-cell">{post.reading_time_minutes} min</TableCell>
      <TableCell numeric className="hidden text-muted-foreground lg:table-cell">{post.views}</TableCell>
      <TableCell className="hidden text-muted-foreground md:table-cell">{formatDate(post.updated_at)}</TableCell>
      <TableCell>
        <div className="flex items-center justify-end gap-1">
          <Button variant="ghost" size="icon-sm" aria-label={`Edit ${post.title}`} onClick={onEdit}>
            <Pencil />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Delete ${post.title}`}
            className="text-muted-foreground hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
