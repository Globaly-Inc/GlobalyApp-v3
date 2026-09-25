import type { ReactNode } from "react";
import { ChevronDown, Mail } from "lucide-react";
import { cn } from "@/lib/utils";
import { COMPANY_ADDRESS, LEGAL_LINKS, LEGAL_UPDATED, siteConfig } from "@/lib/site";
import { GlassPanel } from "./primitives";

/**
 * The frame the Terms, Privacy Policy and Cookie Policy share: a heading, a
 * table of contents, the document, and a way to ask a question about it.
 *
 * The contents are a sticky column from lg up and a collapsed "On this page"
 * list above the text below it, because a sidebar on a phone is either a
 * second scroll or a column of nothing. Sections carry scroll-mt so a jump
 * lands below the fixed bar rather than under it.
 */

export type LegalHeading = Readonly<{ id: string; title: string }>;

/* Typography for the document body, applied once to the article rather than
   to every paragraph by hand. */
const PROSE = cn(
  "[&_p]:mt-4 [&_p]:text-pretty [&_p]:text-[15.5px] [&_p]:leading-[1.75] [&_p]:text-[var(--body)]",
  "[&_ul]:mt-4 [&_ul]:list-disc [&_ul]:space-y-2.5 [&_ul]:pl-5 [&_ul]:marker:text-[var(--primary-bright)]",
  "[&_li]:pl-1 [&_li]:text-[15.5px] [&_li]:leading-[1.7] [&_li]:text-[var(--body)]",
  "[&_h3]:mt-8 [&_h3]:text-[17px] [&_h3]:leading-snug",
  "[&_strong]:font-semibold [&_strong]:text-[var(--foreground)]",
  "[&_a]:font-semibold [&_a]:text-[var(--primary-bright)] [&_a]:underline-offset-2 [&_a:hover]:underline",
);

export function LegalPage({
  title,
  summary,
  headings,
  current,
  children,
}: Readonly<{
  title: string;
  summary: string;
  headings: readonly LegalHeading[];
  /** This page's path, so the "related" links skip it. */
  current: string;
  children: ReactNode;
}>) {
  return (
    <div className="px-3 pb-14 pt-28 sm:px-5 sm:pb-20 md:pt-36">
      <div className="mx-auto max-w-[1100px] px-2">
        <header id="top" className="max-w-3xl">
          <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-[var(--primary-bright)]">
            Legal
          </p>
          <h1 className="mt-3 text-[clamp(2rem,5vw,3rem)] leading-[1.1]">{title}</h1>
          <p className="mt-5 text-pretty text-[16.5px] leading-[1.7] text-[var(--body)]">{summary}</p>
          <p className="mt-4 text-[13.5px] text-[var(--muted-foreground)]">Last updated {LEGAL_UPDATED}</p>
        </header>

        <div className="mt-10 grid gap-8 md:mt-14 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-14">
          <LegalToc headings={headings} />

          <div className="min-w-0">
            <article className={cn(PROSE, "max-w-[72ch]")}>{children}</article>
            <LegalFooter current={current} />
          </div>
        </div>
      </div>
    </div>
  );
}

function LegalToc({ headings }: Readonly<{ headings: readonly LegalHeading[] }>) {
  const list = (
    <ol className="space-y-1">
      {headings.map((heading) => (
        <li key={heading.id}>
          <a
            href={`#${heading.id}`}
            className="block rounded-[10px] px-3 py-1.5 text-[14px] leading-snug text-[var(--muted-foreground)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
          >
            {heading.title}
          </a>
        </li>
      ))}
    </ol>
  );

  return (
    <nav aria-label="On this page">
      {/* Below lg: collapsed above the text. */}
      <details className="group rounded-[var(--r-card)] border border-[var(--border)] bg-[var(--surface)] lg:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 text-[14.5px] font-semibold [&::-webkit-details-marker]:hidden">
          On this page
          <ChevronDown
            className="h-4 w-4 text-[var(--muted-foreground)] transition-transform group-open:rotate-180"
            aria-hidden="true"
          />
        </summary>
        <div className="px-2 pb-3">{list}</div>
      </details>

      {/* lg up: a sticky column beside it. */}
      <div className="sticky top-28 hidden lg:block">
        <p className="px-3 text-[12.5px] font-semibold uppercase tracking-[0.1em] text-[var(--muted-foreground)]">
          On this page
        </p>
        <div className="mt-3">{list}</div>
      </div>
    </nav>
  );
}

/**
 * The props for one section, looked up from the same list the contents are
 * drawn from, so a section's number and title can never disagree with the
 * entry that links to it.
 */
export function sectionOf(headings: readonly LegalHeading[], id: string) {
  const index = headings.findIndex((heading) => heading.id === id);
  if (index === -1) throw new Error(`Legal section "${id}" is not in the contents.`);
  return { id, number: index + 1, title: headings[index]?.title ?? id };
}

/** A numbered section of a document. The number is the reader's way to cite it. */
export function LegalSection({
  id,
  number,
  title,
  children,
}: Readonly<{ id: string; number: number; title: string; children: ReactNode }>) {
  return (
    <section id={id} className="scroll-mt-28 border-t border-[var(--border)] pt-8 [&:not(:first-child)]:mt-10">
      <h2 className="text-[clamp(1.25rem,2.6vw,1.5rem)] leading-snug">
        <span className="v6-gradient-text mr-2.5 tabular-nums">{String(number).padStart(2, "0")}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function LegalFooter({ current }: Readonly<{ current: string }>) {
  const related = LEGAL_LINKS.filter((link) => link.href !== current);

  return (
    <div className="mt-14 grid gap-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <GlassPanel spotlight={false} className="v6-soft p-6 sm:p-7">
        <span className="v6-icon-well flex h-10 w-10 items-center justify-center rounded-[var(--r-chip)]">
          <Mail className="h-[18px] w-[18px] text-[var(--primary-bright)]" aria-hidden="true" />
        </span>
        <h2 className="mt-4 text-[17px]">Questions about this document?</h2>
        <p className="mt-2 text-[14.5px] leading-[1.65] text-[var(--body)]">
          Write to {siteConfig.company} at{" "}
          <a
            href={`mailto:${siteConfig.legalEmail}`}
            className="font-semibold text-[var(--primary-bright)] underline-offset-2 hover:underline"
          >
            {siteConfig.legalEmail}
          </a>
          . We aim to reply within five business days.
        </p>
        <address className="mt-3 text-[14px] not-italic text-[var(--muted-foreground)]">
          {siteConfig.company}, {COMPANY_ADDRESS}
        </address>
      </GlassPanel>

      <GlassPanel spotlight={false} className="p-6 sm:p-7">
        <h2 className="text-[17px]">Related</h2>
        <ul className="mt-3 space-y-2">
          {related.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                className="text-[14.5px] font-semibold text-[var(--primary-bright)] underline-offset-2 hover:underline"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      </GlassPanel>
    </div>
  );
}
