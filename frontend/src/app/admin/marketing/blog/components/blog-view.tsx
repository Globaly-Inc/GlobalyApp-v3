"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, Eye, ImageOff, Loader2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/combobox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { AdminSegmentedTabs } from "../../../components/admin-segmented-tabs";
import { BLOG_TABS, COUNTRY_FILTER_OPTIONS, TOPIC_FILTER_TABS } from "../const";
import { fetchKeywords, fetchPosts, removePost } from "../store/blog-slice";
import type { BlogTab } from "../types";
import type { BlogPost, BlogTopic } from "../apis/types";
import { BlogKeywordsManager } from "./blog-keywords-manager";
import { ConfirmDeleteDialog } from "./confirm-delete-dialog";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function PostRow({ post, onEdit, onDelete }: Readonly<{ post: BlogPost; onEdit: () => void; onDelete: () => void }>) {
  return (
    <div className="flex items-center gap-4 border-b border-border px-4 py-3 last:border-b-0">
      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md bg-muted">
        {post.cover_image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={post.cover_image_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <ImageOff className="h-5 w-5" />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-1.5">
          {post.category && <Badge variant="outline">{post.category}</Badge>}
          <Badge variant={post.is_published ? "default" : "secondary"}>{post.is_published ? "Published" : "Draft"}</Badge>
          {post.seo_score !== null && <Badge variant="outline" className="font-mono">SEO {post.seo_score}</Badge>}
        </div>
        <p className="truncate text-sm font-semibold text-foreground">{post.title}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          {post.author_name && <span>{post.author_name}</span>}
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {post.reading_time_minutes}m
          </span>
          <span>{formatDate(post.updated_at)}</span>
          <span className="inline-flex items-center gap-1">
            <Eye className="h-3 w-3" />
            {post.views}
          </span>
        </div>
      </div>

      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onEdit}>
        <Pencil className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive" onClick={onDelete}>
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

export function BlogView() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const { posts, status } = useAppSelector((state) => state.marketingBlog);
  const [tab, setTab] = useState<BlogTab>("all");
  const [publish, setPublish] = useState("all");
  const [topic, setTopic] = useState<BlogTopic | "all">("all");
  const [country, setCountry] = useState("all");
  const [search, setSearch] = useState("");
  const [sortByViews, setSortByViews] = useState(false);
  const [deleting, setDeleting] = useState<{ id: number; title: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const deletingRef = useRef(false);

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    dispatch(fetchPosts());
    dispatch(fetchKeywords());
  }, [dispatch]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return posts.filter((p) => {
      if (topic !== "all" && p.category !== topic) return false;
      if (country !== "all" && p.country_focus !== country) return false;
      if (needle && !p.title.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [posts, topic, country, search]);

  const visiblePosts = useMemo(() => {
    let result = filtered;
    if (publish === "drafts") result = result.filter((p) => !p.is_published);
    if (publish === "published") result = result.filter((p) => p.is_published);

    if (sortByViews) {
      return [...result].sort((a, b) => b.views - a.views);
    }
    return result;
  }, [filtered, publish, sortByViews]);

  const handleConfirmDelete = async () => {
    if (!deleting || deletingRef.current) return;
    deletingRef.current = true;
    setBusy(true);
    const result = await dispatch(removePost(deleting.id));
    deletingRef.current = false;
    setBusy(false);
    if (result.meta.requestStatus === "rejected") {
      toast.error("Something went wrong", { description: "Please try again." });
      return;
    }
    toast.success("Post deleted");
    setDeleting(null);
  };

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Blog Management</h1>
          <p className="mt-1 text-muted-foreground">{posts.length} total posts</p>
        </div>
        {tab !== "keywords" && (
          <Button className="h-10 gap-1.5" onClick={() => router.push("/admin/marketing/blog/new")}>
            <Plus className="h-4 w-4" />
            New Post
          </Button>
        )}
      </div>

      {tab !== "keywords" && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search posts..." className="h-9 pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>

          <Select value={publish} onValueChange={(v) => setPublish(v ?? "all")}>
            <SelectTrigger className="w-40 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="drafts">Drafts</SelectItem>
              <SelectItem value="published">Published</SelectItem>
            </SelectContent>
          </Select>

          <Select value={topic} onValueChange={(v) => { if (v === "all" || v === "Study" || v === "Work" || v === "Live") setTopic(v); }}>
            <SelectTrigger className="w-40 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TOPIC_FILTER_TABS.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Combobox value={country} onChange={setCountry} options={COUNTRY_FILTER_OPTIONS} className="w-48 h-9" />

          <Button
            variant={sortByViews ? "default" : "outline"}
            size="sm"
            onClick={() => setSortByViews(!sortByViews)}
          >
            {sortByViews ? "Most popular" : "Newest"}
          </Button>
        </div>
      )}

      <AdminSegmentedTabs options={BLOG_TABS} value={tab} onChange={setTab} />

      {tab === "keywords" ? (
        <BlogKeywordsManager />
      ) : status === "loading" && posts.length === 0 ? (
        <div className="flex justify-center py-12">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="rounded-lg border border-border">
          {visiblePosts.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No posts found.</p>
          ) : (
            visiblePosts.map((post) => (
              <PostRow
                key={post.id}
                post={post}
                onEdit={() => router.push(`/admin/marketing/blog/${post.id}/edit`)}
                onDelete={() => setDeleting({ id: post.id, title: post.title })}
              />
            ))
          )}
        </div>
      )}

      <ConfirmDeleteDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        name={deleting?.title ?? ""}
        onConfirm={handleConfirmDelete}
        deleting={busy}
      />
    </div>
  );
}
