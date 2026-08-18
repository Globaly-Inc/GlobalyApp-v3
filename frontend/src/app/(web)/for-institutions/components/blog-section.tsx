import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Reveal } from "../../components/reveal";
import { BLOG_POSTS } from "../static/for-institutions-content";

export function BlogSection() {
  return (
    <section className="py-16 bg-background">
      <div className="container mx-auto px-4">
        <Reveal className="text-center mb-10">
          <h2 className="text-2xl md:text-3xl font-bold mb-3">
            Latest from our <span className="highlight-text active">Blog</span>
          </h2>
          <p className="text-muted-foreground text-sm">
            Expert insights on international recruitment and institutional growth.
          </p>
        </Reveal>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {BLOG_POSTS.map((post, i) => (
            <Reveal key={post.title} delay={i * 0.1}>
              <Link href="/blog" className="group block h-full">
                <div className="rounded-2xl overflow-hidden border border-border bg-muted/10 hover:border-primary/30 transition-all hover:shadow-md h-full">
                  <div className="aspect-[16/10] overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={post.image}
                      alt={post.title}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      loading="lazy"
                    />
                  </div>
                  <div className="p-5">
                    <Badge variant="secondary" className="text-[10px] uppercase tracking-wider mb-3">
                      {post.category}
                    </Badge>
                    <h3 className="font-bold group-hover:text-primary transition-colors line-clamp-2 mb-2 h-10">
                      {post.title}
                    </h3>
                    <p className="text-[10px] text-muted-foreground mt-4">{post.date}</p>
                  </div>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
