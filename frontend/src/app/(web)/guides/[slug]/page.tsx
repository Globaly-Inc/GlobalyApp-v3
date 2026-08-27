import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getGuideBySlug } from "./api";
import { GuideHero } from "./components/guide-hero";

export async function generateMetadata({
  params,
}: Readonly<{ params: Promise<{ slug: string }> }>): Promise<Metadata> {
  const { slug } = await params;
  const guide = await getGuideBySlug(slug);
  if (!guide) return { title: "Guide not found — Globaly" };
  const title = `${guide.title} — Free Guide | Globaly`;
  const description = (guide.context ?? "").slice(0, 160);
  return {
    title,
    description,
    openGraph: { title, description, images: guide.pdf_cover_image_url ? [guide.pdf_cover_image_url] : undefined },
  };
}

// Short, hero-dominant landing page: hero (bg + title/context + lead form), then one
// "What's inside" section. Nothing else — this is a lead-gen page, not a full article.
export default async function GuidePage({ params }: Readonly<{ params: Promise<{ slug: string }> }>) {
  const { slug } = await params;
  const guide = await getGuideBySlug(slug);
  if (!guide) notFound();

  return (
    <div>
      <GuideHero guide={guide} />
      {guide.context && (
        <section className="container mx-auto max-w-3xl px-4 py-14 md:py-20">
          <h2 className="mb-4 text-2xl font-bold text-foreground">What&apos;s inside</h2>
          <p className="whitespace-pre-line text-base leading-relaxed text-muted-foreground">{guide.context}</p>
        </section>
      )}
    </div>
  );
}
