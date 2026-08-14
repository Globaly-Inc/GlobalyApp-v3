import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import DOMPurify from "isomorphic-dompurify";
import { ArrowLeft, Calendar, Clock, Globe, BookOpen, Briefcase, Home } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getPostById } from "../api";

function topicClass(topic: string | null) {
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

export async function generateMetadata({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>): Promise<Metadata> {
  const { id } = await params;
  const post = await getPostById(Number(id));
  if (!post) return { title: "Post not found — Globaly Blog" };
  const title = `${post.meta_title ?? post.title} — Globaly Blog`;
  const description = (post.meta_description ?? post.excerpt ?? "").slice(0, 160);
  return {
    title,
    description,
    openGraph: {
      type: "article",
      title,
      description,
      images: post.cover_image_url ? [post.cover_image_url] : undefined,
    },
  };
}

export default async function BlogPostPage({ params }: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params;
  const post = await getPostById(Number(id));
  if (!post) notFound();

  const readingTime = post.reading_time_minutes || 5;

  return (
    <div>
      <div className="border-b border-border bg-background/95 backdrop-blur sticky top-16 z-10">
        <div className="container max-w-3xl mx-auto px-4 py-2.5">
          <Link href="/blog" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            Back to Blog
          </Link>
        </div>
      </div>

      <article className="container max-w-3xl mx-auto px-4 py-10">
        {(post.category || post.country_focus) && (
          <div className="flex flex-wrap gap-2 mb-4">
            {post.category && (
              <Badge className={`flex items-center gap-1.5 border ${topicClass(post.category)}`}>
                {topicIcon(post.category)}
                {post.category}
              </Badge>
            )}
            {post.country_focus && (
              <Badge variant="outline" className="flex items-center gap-1.5">
                <Globe className="h-3 w-3" />
                {post.country_focus}
              </Badge>
            )}
          </div>
        )}

        <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-4 leading-tight">{post.title}</h1>

        {post.excerpt && <p className="text-lg text-muted-foreground mb-6 leading-relaxed">{post.excerpt}</p>}

        <div className="flex items-center gap-4 flex-wrap pb-6 border-b border-border">
          <div className="flex items-center gap-2">
            {post.author_avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={post.author_avatar_url} alt={post.author_name ?? "Author"} className="h-10 w-10 rounded-full object-cover" />
            ) : (
              <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
                {(post.author_name ?? "G").charAt(0)}
              </div>
            )}
            <div>
              <p className="text-sm font-medium text-foreground">{post.author_name ?? "Globaly Team"}</p>
              <p className="text-xs text-muted-foreground">Author</p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground ml-auto flex-wrap">
            {post.published_at && (
              <span className="flex items-center gap-1.5">
                <Calendar className="h-4 w-4" />
                {new Date(post.published_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <Clock className="h-4 w-4" />
              {readingTime} min read
            </span>
            {post.views > 0 && <span className="text-xs">{post.views.toLocaleString()} views</span>}
          </div>
        </div>

        {post.cover_image_url && (
          <div className="my-8 rounded-xl overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={post.cover_image_url} alt={post.title} className="w-full object-cover" />
          </div>
        )}

        <div
          className="prose prose-sm md:prose-base max-w-none text-foreground
            prose-headings:text-foreground prose-headings:font-bold
            prose-p:text-foreground prose-p:leading-relaxed
            prose-a:text-primary prose-a:no-underline hover:prose-a:underline
            prose-blockquote:border-l-primary prose-blockquote:text-muted-foreground
            prose-strong:text-foreground prose-code:text-primary
            prose-img:rounded-lg prose-img:mx-auto"
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(post.content ?? "<p>Content coming soon.</p>") }}
        />

        {post.tags.length > 0 && (
          <div className="mt-8 pt-6 border-t border-border">
            <p className="text-sm font-medium text-muted-foreground mb-2">Tags:</p>
            <div className="flex flex-wrap gap-2">
              {post.tags.map((tag) => (
                <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
              ))}
            </div>
          </div>
        )}

        <div className="mt-10 pt-6 border-t border-border">
          <Link href="/blog" className="flex items-center gap-2 text-sm text-primary hover:underline">
            <ArrowLeft className="h-4 w-4" /> Back to all posts
          </Link>
        </div>
      </article>
    </div>
  );
}
