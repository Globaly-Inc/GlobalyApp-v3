import Link from "next/link";
import { ArrowLeft, Check, Sparkles, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";

type ComingSoonProps = Readonly<{
  title: string;
  /** One line on what the feature will do. Falls back to a generic line. */
  description?: string;
  /** The same lucide icon the sidebar uses for this route, so the page reads as that nav item. */
  icon?: LucideIcon;
  /** Up to ~4 short capability lines. Omit rather than padding with filler. */
  features?: readonly string[];
  /** Where the "go back" button points — defaults to the personal portal home. */
  backHref?: string;
  backLabel?: string;
  className?: string;
}>;

/** A route whose feature isn't built yet (mockup Placeholder): header with a "Coming soon" badge, one calm card. */
export function ComingSoon({
  title,
  description = "We're building this. It'll show up here the moment it's ready.",
  icon: Icon = Sparkles,
  features,
  backHref = "/personal/portal",
  backLabel = "Back to home",
  className,
}: ComingSoonProps) {
  return (
    <PageBody className={className}>
      <PageHeader title={<><Icon /> {title}</>} badges={<Badge variant="outline">Coming soon</Badge>} />
      <Card className="mx-auto w-full max-w-3xl">
        <div className="mx-auto flex max-w-lg flex-col items-center px-6 py-10 text-center">
          <span className="mb-5 flex size-14 items-center justify-center rounded-full bg-primary-light text-primary">
            <Icon className="size-6" aria-hidden />
          </span>
          <p className="text-pretty text-sm leading-relaxed text-muted-foreground sm:text-base">{description}</p>

          {features && features.length > 0 && (
            <ul className="mt-6 flex w-full max-w-sm flex-col gap-2.5 text-left">
              {features.map((feature) => (
                <li key={feature} className="flex items-start gap-2.5 text-sm text-foreground">
                  <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                  {feature}
                </li>
              ))}
            </ul>
          )}

          <Button variant="outline" size="sm" className="mt-8" render={<Link href={backHref} />}>
            <ArrowLeft />
            {backLabel}
          </Button>
        </div>
      </Card>
    </PageBody>
  );
}
