"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CoverLogoEditor } from "@/components/cover-logo-editor";
import { cn } from "@/lib/utils";

export type DetailStat = { label: string; value: React.ReactNode };

type DetailHeaderCardProps = {
  coverUrl: string | null;
  logoUrl: string | null;
  /** Text for the editable logo; read-only banners may pass an icon. */
  logoFallback: React.ReactNode;
  /** A person's photo: round and cover-cropped instead of a padded square logo tile. */
  roundPhoto?: boolean;
  /** Pass both upload handlers to make the cover and logo editable; omit them for a read-only banner. */
  onCoverFile?: (file: File) => void;
  onLogoFile?: (file: File) => void;
  uploading?: "cover" | "logo" | null;
  /** Muted line(s) beside the logo: type, location, contact. */
  children?: React.ReactNode;
  /** Headline counts on the right (mockup: Courses · Branches · Members). */
  stats?: DetailStat[];
  className?: string;
};

/**
 * The card under a detail page's header (mockup C3): cover image, overlapping logo, a meta line and headline stats.
 * The page's name lives in `PageHeader`, so this card never repeats it as a heading.
 */
export function DetailHeaderCard({
  coverUrl, logoUrl, logoFallback, roundPhoto = false, onCoverFile, onLogoFile, uploading = null, children, stats, className,
}: Readonly<DetailHeaderCardProps>) {
  return (
    <section data-slot="detail-header-card" className={cn("overflow-hidden rounded-lg border bg-card text-card-foreground shadow-sm", className)}>
      {onLogoFile ? (
        <CoverLogoEditor
          coverUrl={coverUrl}
          onCoverFile={onCoverFile}
          coverUploading={uploading === "cover"}
          logoUrl={logoUrl}
          logoFallback={typeof logoFallback === "string" ? logoFallback : ""}
          roundPhoto={roundPhoto}
          onLogoFile={onLogoFile}
          logoUploading={uploading === "logo"}
          className="h-32 sm:h-36"
        />
      ) : (
        <div className={cn("relative h-32 sm:h-36", coverUrl ? "bg-muted" : "bg-gradient-to-br from-primary to-primary/70")}>
          {coverUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
          )}
          <Avatar className={cn("absolute -bottom-12 left-10 size-24 border-4 border-background shadow-lg", roundPhoto ? "rounded-full" : "rounded-xl bg-white")}>
            {logoUrl && <AvatarImage src={logoUrl} alt="" className={roundPhoto ? "object-cover" : "rounded-lg object-contain p-1"} />}
            <AvatarFallback className={cn("text-2xl", !roundPhoto && "rounded-lg")}>{logoFallback}</AvatarFallback>
          </Avatar>
        </div>
      )}
      <div className="flex min-h-16 flex-col gap-4 px-5 pt-16 pb-5 sm:flex-row sm:items-end sm:justify-between sm:pt-4 sm:pl-40">
        <div className="min-w-0 space-y-1 text-sm text-muted-foreground">{children}</div>
        {stats && stats.length > 0 && (
          <dl className="flex flex-wrap gap-x-8 gap-y-3">
            {stats.map((s) => (
              <div key={s.label}>
                <dt className="text-xs text-muted-foreground">{s.label}</dt>
                <dd className="font-heading text-xl font-medium tabular-nums text-foreground">{s.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </section>
  );
}
