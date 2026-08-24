import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Reveal } from "../../components/reveal";
import { AutoScrollRow } from "../../components/auto-scroll-row";
import type { BlogCardData } from "../static-content";

export function BlogCarousel({ posts }: Readonly<{ posts: BlogCardData[] }>) {
  return (
    <section className="py-16 bg-background">
      <div className="container mx-auto px-4">
        <Reveal className="text-center mb-10">
          <h2 className="text-2xl md:text-3xl font-bold mb-3">
            Latest from our <span className="highlight-text active">Blog</span>
          </h2>
          <p className="text-muted-foreground text-sm">Expert insights on international education and student success.</p>
        </Reveal>

        <AutoScrollRow className="flex gap-4 pb-4">
          {posts.map((post, i) => (
            <Reveal key={post.id} delay={i * 0.1} className="flex-shrink-0">
              <Link href={`/blog/${post.id}`} className="group block w-72 md:w-80">
                <div className="rounded-2xl overflow-hidden border border-border bg-muted/10 hover:border-primary/30 transition-all hover:shadow-md h-full">
                  <div className="aspect-[16/10] overflow-hidden bg-muted">
                    {post.cover_image_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={post.cover_image_url} alt={post.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                    )}
                  </div>
                  <div className="p-5">
                    {post.category && <Badge variant="secondary" className="text-[10px] uppercase tracking-wider mb-3">{post.category}</Badge>}
                    <h3 className="font-bold group-hover:text-primary transition-colors line-clamp-2 mb-2 h-10">{post.title}</h3>
                    <div className="flex items-center justify-between mt-4">
                      <p className="text-[10px] text-muted-foreground">
                        {post.published_at
                          ? new Date(post.published_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })
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
