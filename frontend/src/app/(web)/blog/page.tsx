import Link from "next/link";
import type { Metadata } from "next";
import { Globe, BookOpen, Briefcase, Home, Calendar, Clock, Eye, GraduationCap, Plane, MapPin, PenLine } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getFilters, getPosts } from "./api";
import type { PublicBlogPost } from "./types";
import { BlogHeroHeading } from "./components/blog-hero-heading";
import { BlogCta } from "./components/blog-cta";
import { Reveal } from "../components/reveal";

export const metadata: Metadata = {
  title: "Blog — Globaly",
  description: "Insights on studying at your home country or overseas, with expert guides, tips, and real stories to help students, agents, and institutions navigate a new country with confidence.",
};
const COUNTRY_FLAGS: Record<string, string> = {
  Australia: "🇦🇺",
  "United Kingdom": "🇬🇧",
  Canada: "🇨🇦",
  "United States": "🇺🇸",
  "New Zealand": "🇳🇿",
  Germany: "🇩🇪",
  Ireland: "🇮🇪",
  India: "🇮🇳",
};

function topicColor(topic: string | null) {
  switch (topic) {
    case "Study": return "bg-primary/10 text-primary border-primary/20";
    case "Work": return "bg-amber-500/10 text-amber-600 border-amber-500/20";
    case "Live": return "bg-emerald-500/10 text-emerald-600 border-emerald-500/20";
    default: return "bg-secondary text-secondary-foreground";
  }
}

function topicIcon(topic: string | null) {
  switch (topic) {
    case "Study": return <BookOpen className="h-3 w-3" />;
    case "Work": return <Briefcase className="h-3 w-3" />;
    case "Live": return <Home className="h-3 w-3" />;
    default: return null;
  }
}

function filterHref(topic: string, country: string) {
  const qs = new URLSearchParams();
  if (topic) qs.set("topic", topic);
  if (country) qs.set("country", country);
  const s = qs.toString();
  return s ? `/blog?${s}` : "/blog";
}

function PostCard({ post }: Readonly<{ post: PublicBlogPost }>) {
  return (
    <Link
      href={`/blog/${post.id}`}
      className="group flex flex-col rounded-xl border border-border bg-card overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
    >
      <div className="aspect-video bg-muted overflow-hidden">
        {post.cover_image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.cover_image_url}
            alt={post.title}
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-linear-to-br from-primary/10 to-primary/5">
            <Globe className="h-12 w-12 text-primary/30" />
          </div>
        )}
      </div>

      <div className="flex flex-col flex-1 p-5">
        <div className="flex flex-wrap gap-1.5 mb-2">
          {post.category && (
            <Badge className={`text-xs flex items-center gap-1 border ${topicColor(post.category)}`}>
              {topicIcon(post.category)}
              {post.category}
            </Badge>
          )}
          {post.country_focus && (
            <Badge variant="outline" className="text-xs">
              {COUNTRY_FLAGS[post.country_focus] ?? "🌍"} {post.country_focus}
            </Badge>
          )}
        </div>

        <h2 className="text-base font-semibold text-foreground mb-2 line-clamp-2 group-hover:text-primary transition-colors">
          {post.title}
        </h2>
        {post.excerpt && <p className="text-sm text-muted-foreground mb-3 line-clamp-2 flex-1">{post.excerpt}</p>}

        {post.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {post.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                {tag}
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between mt-auto pt-3 border-t border-border">
          <div className="flex items-center gap-2">
            {post.author_avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={post.author_avatar_url} alt={post.author_name ?? "Author"} className="h-6 w-6 rounded-full object-cover" />
            ) : (
              <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-bold">
                {(post.author_name ?? "G").charAt(0)}
              </div>
            )}
            <span className="text-xs text-muted-foreground">{post.author_name ?? "Globaly Team"}</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {post.published_at && (
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {new Date(post.published_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {post.reading_time_minutes}m
            </span>
            <span className="flex items-center gap-1">
              <Eye className="h-3 w-3" />
              {post.views}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

export default async function BlogPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ topic?: string; country?: string; page?: string }> }>) {
  const { topic = "", country = "", page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  const [{ data: posts, meta }, filters] = await Promise.all([
    getPosts({ page, category: topic || undefined, country_focus: country || undefined }),
    getFilters(),
  ]);

  const topicOptions = [{ label: "All", value: "" }, ...filters.categories.map((value) => ({ label: value, value }))];
  const countryOptions = [
    { label: "All", value: "", flag: "🌍" },
    ...filters.countries.map((value) => ({ label: value, value, flag: COUNTRY_FLAGS[value] ?? "🌍" })),
  ];

  return (
    <div>
      <section className="relative overflow-hidden border-b border-border py-20 md:py-28">
        <div
          className="absolute inset-0 -z-20 opacity-[0.4] [background-image:radial-gradient(var(--color-primary)_1px,transparent_1px)] [background-size:24px_24px] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_0%,black,transparent)]"
          aria-hidden
        />
        <div
          className="absolute -top-24 left-1/2 -z-10 h-72 w-[36rem] -translate-x-1/2 rounded-full bg-primary/15 blur-3xl"
          aria-hidden
        />

        <div className="pointer-events-none absolute inset-0 -z-10 hidden sm:block" aria-hidden>
          <GraduationCap
            className="absolute left-[8%] top-[18%] h-16 w-16 text-primary/20 animate-float"
            style={{ animationDelay: "0s", "--float-rotate": "-8deg" } as React.CSSProperties}
          />
          <Plane
            className="absolute right-[12%] top-[14%] h-13 w-13 text-primary/20 animate-float"
            style={{ animationDelay: "1.2s", "--float-rotate": "12deg" } as React.CSSProperties}
          />
          <BookOpen
            className="absolute left-[16%] bottom-[16%] h-14 w-14 text-primary/20 animate-float"
            style={{ animationDelay: "2.1s" } as React.CSSProperties}
          />
          <Briefcase
            className="absolute right-[18%] bottom-[20%] h-13 w-13 text-primary/20 animate-float"
            style={{ animationDelay: "0.6s", "--float-rotate": "-10deg" } as React.CSSProperties}
          />
          <MapPin
            className="absolute right-[7%] top-[40%] h-11 w-11 text-primary/20 animate-float"
            style={{ animationDelay: "1.8s" } as React.CSSProperties}
          />
          <PenLine
            className="absolute left-[6%] top-[42%] h-11 w-11 text-primary/20 animate-float"
            style={{ animationDelay: "2.6s", "--float-rotate": "6deg" } as React.CSSProperties}
          />
        </div>

        <div className="container max-w-3xl mx-auto px-4 text-center">
          <Reveal>
            <div className="mb-5 inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-primary">
              <Globe className="h-3.5 w-3.5" />
              Globaly Blog
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <BlogHeroHeading />
          </Reveal>
          <Reveal delay={0.2}>
            <p className="text-lg text-muted-foreground max-w-xl mx-auto">
             Expert guides, tips, and stories to help students, education counselors, and institutions navigate the world of
            international education.
            </p>
          </Reveal>
        </div>
      </section>

      {(filters.categories.length > 0 || filters.countries.length > 0) && (
      <section className="sticky top-16 z-10 bg-background/95 backdrop-blur border-b border-border">
        <div className="container max-w-6xl mx-auto px-4">
          <div className="flex items-center gap-1.5 overflow-x-auto py-3 animate-fade-in">
            {topicOptions.map((t) => {
              const active = topic === t.value;
              return (
                <Link key={t.value} href={filterHref(t.value, country)} scroll={false}>
                  <Button
                    type="button"
                    size="sm"
                    variant={active ? "default" : "ghost"}
                    className="h-8 rounded-full px-3 gap-1.5 whitespace-nowrap text-sm font-medium transition-transform hover:scale-105"
                  >
                    {topicIcon(t.value)}
                    {t.label}
                  </Button>
                </Link>
              );
            })}
            <div className="w-px h-5 bg-border shrink-0 mx-1" />
            {countryOptions.map((c) => {
              const active = country === c.value;
              return (
                <Link key={c.value} href={filterHref(topic, c.value)} scroll={false}>
                  <Button
                    type="button"
                    size="sm"
                    variant={active ? "default" : "ghost"}
                    className="h-8 rounded-full px-3 gap-1 whitespace-nowrap text-sm font-medium transition-transform hover:scale-105"
                  >
                    <span>{c.flag}</span>
                    <span>{c.label}</span>
                  </Button>
                </Link>
              );
            })}
          </div>
        </div>
      </section>
      )}

      <section className="py-12">
        <div className="container max-w-6xl mx-auto px-4">
          {posts.length === 0 ? (
            <div className="text-center py-20">
              <Globe className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
              <p className="text-muted-foreground text-lg">
                {topic || country ? "No blog posts found with these filters." : "No blog posts yet — check back soon."}
              </p>
              {(topic || country) && (
                <Link href="/blog" className="mt-3 inline-block text-sm text-primary hover:underline">
                  Clear filters
                </Link>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {posts.map((post, i) => (
                <Reveal key={post.id} delay={(i % 3) * 0.1}>
                  <PostCard post={post} />
                </Reveal>
              ))}
            </div>
          )}

          {meta.total > 0 && (
            <div className="text-center mt-12 space-y-3">
              {meta.totalPages > 1 && (
                <nav aria-label="Blog pagination" className="flex items-center justify-center gap-2 flex-wrap">
                  {page > 1 ? (
                    <Link href={{ pathname: "/blog", query: { topic, country, page: page - 1 } }} scroll={false}>
                      <Button variant="outline" size="sm">← Previous</Button>
                    </Link>
                  ) : (
                    <Button variant="outline" size="sm" disabled>← Previous</Button>
                  )}
                  <span className="text-sm text-muted-foreground px-2">
                    Page {page} of {meta.totalPages}
                  </span>
                  {page < meta.totalPages ? (
                    <Link href={{ pathname: "/blog", query: { topic, country, page: page + 1 } }} scroll={false}>
                      <Button variant="outline" size="sm">Next →</Button>
                    </Link>
                  ) : (
                    <Button variant="outline" size="sm" disabled>Next →</Button>
                  )}
                </nav>
              )}
              <p className="text-sm text-muted-foreground">
                Showing {posts.length} of {meta.total} post{meta.total !== 1 ? "s" : ""}
              </p>
            </div>
          )}
        </div>
      </section>

      <BlogCta />
    </div>
  );
}
