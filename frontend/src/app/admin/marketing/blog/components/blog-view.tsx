"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterBar, SearchInput } from "@/components/ui/filter-bar";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TableBody, TableCard, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Combobox } from "@/components/combobox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { SectionTabs } from "@/components/section-tabs";
import { BLOG_TABS, COUNTRY_FILTER_OPTIONS, TOPIC_FILTER_TABS } from "../const";
import { clearGenerationJobs, fetchKeywords, fetchPosts, removePost } from "../store/blog-slice";
import type { BlogTab } from "../types";
import type { BlogTopic } from "../apis/types";
import { BLOG_POST_COLUMNS, BlogPostRow } from "./blog-post-row";
import { BlogKeywordsManager } from "./blog-keywords-manager";
import { ConfirmDeleteDialog } from "./confirm-delete-dialog";
import { GenerateDialog } from "./generate-dialog";
import { GenerationProgress } from "./generation-progress";

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
  const [generateOpen, setGenerateOpen] = useState(false);
  const deletingRef = useRef(false);

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    dispatch(fetchPosts());
    dispatch(fetchKeywords());
  }, [dispatch]);

  // Clear stale generation jobs when leaving the blog section so they don't
  // restart polling on the next mount.
  useEffect(() => () => { dispatch(clearGenerationJobs()); }, [dispatch]);

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
    <PageBody>
      <PageHeader title={<><FileText /> Blog Management</>} subtitle={`${posts.length} total posts`}>
        {tab !== "keywords" && (
          <>
            <Button variant="outline" className="h-10 gap-1.5" onClick={() => setGenerateOpen(true)}>
              <Sparkles className="h-4 w-4" />
              Generate with AI
            </Button>
            <Button className="h-10 gap-1.5" onClick={() => router.push("/admin/marketing/blog/new")}>
              <Plus className="h-4 w-4" />
              New Post
            </Button>
          </>
        )}
      </PageHeader>

      <SectionTabs options={BLOG_TABS} value={tab} onChange={setTab} />

      {tab === "keywords" ? (
        <BlogKeywordsManager />
      ) : (
        <div className="space-y-4">
          <GenerationProgress />

          <FilterBar>
            <SearchInput placeholder="Search posts" value={search} onChange={(e) => setSearch(e.target.value)} />

            <Select value={publish} onValueChange={(v) => setPublish(v ?? "all")}>
              <SelectTrigger className="h-10 w-40 bg-background" aria-label="Publish status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="drafts">Drafts</SelectItem>
                <SelectItem value="published">Published</SelectItem>
              </SelectContent>
            </Select>

            <Select value={topic} onValueChange={(v) => { if (v === "all" || v === "Study" || v === "Work" || v === "Live") setTopic(v); }}>
              <SelectTrigger className="h-10 w-40 bg-background" aria-label="Topic">
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

            <Combobox value={country} onChange={setCountry} options={COUNTRY_FILTER_OPTIONS} className="h-10 w-48 bg-background" />

            <Button variant={sortByViews ? "default" : "outline"} className="h-10" onClick={() => setSortByViews(!sortByViews)}>
              {sortByViews ? "Most popular" : "Newest"}
            </Button>

            <span className="shrink-0 px-2 text-sm text-muted-foreground">
              {visiblePosts.length} post{visiblePosts.length === 1 ? "" : "s"}
            </span>
          </FilterBar>

          {status === "loading" && posts.length === 0 ? (
            <ListSkeleton count={6} itemClassName="h-16" />
          ) : visiblePosts.length === 0 ? (
            <EmptyState icon={FileText} title="No posts found." />
          ) : (
            <TableCard>
              <Table>
                <TableHeader>
                  <TableRow>
                    {BLOG_POST_COLUMNS.map((col) => (
                      <TableHead key={col.label} numeric={"numeric" in col} className={"className" in col ? col.className : undefined}>
                        {"srOnly" in col ? <span className="sr-only">{col.label}</span> : col.label}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visiblePosts.map((post) => (
                    <BlogPostRow
                      key={post.id}
                      post={post}
                      onEdit={() => router.push(`/admin/marketing/blog/${post.id}/edit`)}
                      onDelete={() => setDeleting({ id: post.id, title: post.title })}
                    />
                  ))}
                </TableBody>
              </Table>
            </TableCard>
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

      <GenerateDialog open={generateOpen} onOpenChange={setGenerateOpen} onStarted={() => setTab("all")} />
    </PageBody>
  );
}
