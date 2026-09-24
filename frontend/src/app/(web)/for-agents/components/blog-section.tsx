import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Reveal } from "../../components/reveal";

const BLOG_POSTS = [
  {
    title: "Visa Document Checklist for Australia (2025 Edition)",
    image:
      "https://cdn.sanity.io/images/ghn0jurr/production/87712abb1eadffd2eff78ee7b4b1883ca59e5656-5472x3648.jpg?auto=format&fit=max&q=75&w=300",
    date: "Jan 2, 2026",
    tags: ["🇦🇺 Australia"],
    slug: "visa-document-checklist-for-australia-2025-edition",
  },
  {
    title: "How Many Hours Can Students Work in Australia? (2025 Guide)",
    image:
      "https://cdn.sanity.io/images/ghn0jurr/production/e02fa6d1c7406eace5eff2b85ce4e5f5e38cb616-2296x3440.jpg?auto=format&fit=max&q=75&w=300",
    date: "Jan 2, 2026",
    tags: ["🇦🇺 Australia"],
    slug: "how-many-hours-can-students-work-in-australia-2025-guide",
  },
  {
    title: "AI-Proof Your Future: Top Non-IT Jobs in Australia for 2025",
    image:
      "https://cdn.sanity.io/images/ghn0jurr/production/1af61087cf05a4417ddb5e78664755790cb474cc-5096x2856.jpg?auto=format&fit=max&q=75&w=300",
    date: "Jan 1, 2026",
    tags: ["💼 Work", "🇦🇺 Australia"],
    slug: "ai-proof-your-future-top-non-it-jobs-in-australia-for-2025",
  },
];

export function BlogSection() {
  return (
    <section className="py-16 bg-background">
      <div className="container mx-auto px-4">
        <Reveal className="text-center mb-10">
          <h2 className="text-2xl md:text-3xl font-bold mb-3">
            Latest from our <span className="highlight-text active">Blog</span>
          </h2>
          <p className="text-muted-foreground">Expert insights on international education and education counselor success.</p>
        </Reveal>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {BLOG_POSTS.map((post, i) => (
            <Reveal key={post.slug} delay={i * 0.1}>
              {/* v3's blog route resolves posts by numeric id (see blog/[id]), not slug, and these three
                  posts are illustrative (ported verbatim from V2's hardcoded array) rather than real CMS
                  entries — so link to the blog index instead of a slug URL that would 404. */}
              <Link href="/blog" className="group block">
                <div className="rounded-2xl overflow-hidden border border-border bg-muted/10 hover:border-primary/30 transition-all hover:shadow-md h-full">
                  <div className="aspect-[16/10] overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={post.image}
                      alt={post.title}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  </div>
                  <div className="p-5">
                    <div className="flex gap-2 mb-3">
                      {post.tags.map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-[10px] uppercase tracking-wider">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                    <h3 className="font-bold group-hover:text-primary transition-colors line-clamp-2 mb-2">
                      {post.title}
                    </h3>
                    <p className="text-xs text-muted-foreground">{post.date}</p>
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
