import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import { getPublishedGuides } from "./api";

export const metadata: Metadata = {
  title: "Country Education Guides — Globaly",
  description:
    "Free guides to studying, living, and working abroad. Download your country guide today.",
  openGraph: {
    title: "Country Education Guides — Globaly",
    description: "Free guides to studying, living, and working abroad.",
    images: ["/globaly-logo.png"],
  },
};

export default async function GuidesPage() {
  const guides = await getPublishedGuides();

  return (
    <>
      <section className="bg-[hsl(var(--purple-dark))] py-20 text-white text-center">
        <div className="container mx-auto px-4">
          <h1 className="text-3xl sm:text-4xl font-bold mb-4">Country Education Guides</h1>
          <p className="text-white/70 max-w-xl mx-auto text-base sm:text-lg">
            Everything you need to know about studying, living, and working in your destination
            country — free to download.
          </p>
        </div>
      </section>

      <section className="container mx-auto px-4 py-14">
        {guides.length === 0 ? (
          <p className="text-center text-muted-foreground py-20">No guides available yet.</p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {guides.map((guide) => {
              const cover = guide.pdf_cover_image_url ?? guide.background_image_url;
              return (
                <Link
                  key={guide.slug}
                  href={`/guides/${guide.slug}`}
                  className="group block rounded-2xl border border-border overflow-hidden hover:shadow-md transition-shadow"
                >
                  {cover ? (
                    <div className="overflow-hidden aspect-[4/3] bg-muted">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={cover}
                        alt={guide.title}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        loading="lazy"
                      />
                    </div>
                  ) : (
                    <div className="aspect-[4/3] bg-primary/10" />
                  )}
                  <div className="p-5">
                    {guide.country && (
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                        {guide.country}
                      </p>
                    )}
                    <h2 className="font-bold text-lg mb-3 group-hover:text-primary transition-colors">
                      {guide.title}
                    </h2>
                    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-primary">
                      Get Free Guide <ArrowRight className="h-4 w-4" />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
