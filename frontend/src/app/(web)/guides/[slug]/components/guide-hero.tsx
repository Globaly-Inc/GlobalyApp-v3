import type { PublicGuide } from "../types";
import { LeadForm } from "./lead-form";

export function GuideHero({ guide }: Readonly<{ guide: PublicGuide }>) {
  return (
    <section className="relative overflow-hidden bg-foreground">
      {guide.background_video_url ? (
        <video
          className="absolute inset-0 h-full w-full object-cover"
          src={guide.background_video_url}
          autoPlay
          muted
          loop
          playsInline
        />
      ) : guide.background_image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={guide.background_image_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 bg-linear-to-br from-primary/40 via-foreground to-primary/20" />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/45 to-black/75" />

      <div className="relative container mx-auto grid gap-10 px-4 py-20 md:grid-cols-2 md:items-center md:py-28">
        <div className="text-white">
          {guide.country && (
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/70 sm:text-sm">{guide.country}</p>
          )}
          <h1 className="mb-4 text-3xl font-bold sm:text-4xl md:text-5xl">{guide.title}</h1>
          {guide.context && <p className="max-w-md text-base leading-relaxed text-white/80 sm:text-lg">{guide.context}</p>}
        </div>

        <div className="w-full max-w-sm justify-self-start rounded-2xl bg-card p-6 shadow-xl ring-1 ring-foreground/10 md:justify-self-end md:p-8">
          {guide.pdf_cover_image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={guide.pdf_cover_image_url}
              alt={guide.title}
              className="mb-5 h-48 w-full rounded-lg object-cover shadow-md"
            />
          )}
          <LeadForm slug={guide.slug} />
        </div>
      </div>
    </section>
  );
}
