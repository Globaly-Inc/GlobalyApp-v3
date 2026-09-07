"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Reveal } from "./reveal";
import { AutoScrollRow } from "./auto-scroll-row";
import { getPosts } from "../blog/api";
import type { PublicBlogPost } from "../blog/types";

/** Real published posts from the blog; the section hides itself when the feed has nothing to show. */
export function LatestBlogSection({ subtitle }: Readonly<{ subtitle: string }>) {
  const [posts, setPosts] = useState<PublicBlogPost[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    getPosts({})
      .then((res) => setPosts(res.data.slice(0, 6)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (!loading && posts.length === 0) return null;

  return (
    <section className="py-16 bg-background">
      <div className="container mx-auto px-4">
        <Reveal className="text-center mb-10">
          <h2 className="text-2xl md:text-3xl font-bold mb-3">
            Latest from our <span className="highlight-text active">Blog</span>
          </h2>
          <p className="text-muted-foreground text-sm">{subtitle}</p>
        </Reveal>

        <AutoScrollRow className="flex gap-4 pb-4">
          {loading
            ? Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="flex-shrink-0 w-72 md:w-80 h-72 rounded-2xl" />
              ))
            : posts.map((post, i) => (
            <Reveal key={post.id} delay={i * 0.1} className="flex-shrink-0">
              <Link href={`/blog/${post.id}`} className="group block w-72 md:w-80 h-full">
                <div className="rounded-2xl overflow-hidden border border-border bg-muted/10 hover:border-primary/30 transition-all hover:shadow-md h-full flex flex-col">
                  <div className="aspect-[16/10] overflow-hidden bg-muted">
                    {post.cover_image_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={post.cover_image_url}
                        alt={post.title}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    )}
                  </div>
                  <div className="p-5 flex-1 flex flex-col">
                    {post.category && (
                      <Badge variant="secondary" className="text-[10px] uppercase tracking-wider mb-3">
                        {post.category}
                      </Badge>
                    )}
                    <h3 className="font-bold group-hover:text-primary transition-colors line-clamp-2 mb-2">
                      {post.title}
                    </h3>
                    <div className="flex items-center justify-between mt-auto pt-4">
                      <p className="text-[10px] text-muted-foreground">
                        {post.published_at
                          ? new Date(post.published_at).toLocaleDateString("en-AU", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })
                          : ""}
                      </p>
                      <span className="text-xs font-semibold text-primary flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                        Read more <ArrowRight className="h-3 w-3" />
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            </Reveal>
              ))}
        </AutoScrollRow>
      </div>
    </section>
  );
}
