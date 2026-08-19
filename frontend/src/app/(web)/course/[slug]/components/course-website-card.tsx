import { Globe, ExternalLink } from "lucide-react";
import { safeUrl } from "@/lib/safe-url";
import { SectionCard } from "./section-card";

/** Link out to the course page on the institution's own website. */
export function CourseWebsiteCard({ url }: Readonly<{ url: string }>) {
  // `course.source_url` comes from the scraper, which never passed through the backend's
  // `webUrl()`. Guard here rather than at the caller so every call site is covered, and
  // drop the whole card when there is nothing linkable — never render a dead anchor.
  const href = safeUrl(url);
  if (!href) return null;

  return (
    <SectionCard icon={Globe} title="Institution website">
      <a
        href={href}
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
