import Link from "next/link";
import { BookOpen } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Reveal } from "../../components/reveal";
import type { PublicBlogPost } from "../../blog/types";

export function CountryBlog({ posts }: Readonly<{ posts: PublicBlogPost[] }>) {
  if (posts.length === 0) return null;

  return (
    <Reveal>
      <h2 className="mb-4 text-2xl font-bold">Community News &amp; Guides</h2>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {posts.map((post) => (
          <Link key={post.id} href={`/blog/${post.id}`}>
            <Card className="h-full overflow-hidden transition-shadow hover:shadow-md">
              {post.cover_image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={post.cover_image_url} alt={post.title} className="h-40 w-full object-cover" />
              )}
              <CardContent className="pt-4">
                <h3 className="line-clamp-2 font-semibold">{post.title}</h3>
                {post.excerpt && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{post.excerpt}</p>}
                <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <BookOpen className="h-3.5 w-3.5" /> {post.reading_time_minutes} min read
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </Reveal>
  );
}
