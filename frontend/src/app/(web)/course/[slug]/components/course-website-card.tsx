import { Globe, ExternalLink } from "lucide-react";
import { SectionCard } from "./section-card";

/** Link out to the course page on the institution's own website. */
export function CourseWebsiteCard({ url }: Readonly<{ url: string }>) {
  return (
    <SectionCard icon={Globe} title="Institution website">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
      >
        View this course on the institution&apos;s website
        <ExternalLink className="h-3.5 w-3.5" />
      </a>
    </SectionCard>
  );
}
