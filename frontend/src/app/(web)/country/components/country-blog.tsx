import Link from "next/link";
import { ArrowRight, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Reveal } from "../../components/reveal";
import type { PublicBlogPost } from "../../blog/types";

export function CountryBlog({ posts }: Readonly<{ posts: PublicBlogPost[] }>) {
  if (posts.length === 0) return null;

  return (
    <Reveal>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-bold">Community News &amp; Guides</h2>
        <Button variant="outline" className="h-10 gap-1.5" render={<Link href="/blog" />}>
          All Articles <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {posts.map((post) => (
          <Link key={post.id} href={`/blog/${post.id}`}>
            <Card className="h-full overflow-hidden transition-shadow hover:shadow-md">
              {post.cover_image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={post.cover_image_url} alt={post.title} className="h-40 w-full object-cover" />
              )}
              <CardContent className="p-4">
                <p className="line-clamp-2 text-sm font-semibold">{post.title}</p>
                {post.excerpt && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{post.excerpt}</p>}
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
