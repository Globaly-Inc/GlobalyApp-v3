"use client";

import Link from "next/link";
import { CalendarDays, Check, Clock, GraduationCap, MapPin, Monitor, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCompareTray } from "@/app/(web)/search/use-compare-tray";
import type { CompareCourseItem } from "@/app/(web)/search/types";
import type { CourseCard as CourseCardType } from "../apis/types";
import { InstitutionLogo } from "@/components/institution-logo";

type CourseCardProps = {
  card: CourseCardType;
};

function prettify(value: string): string {
  const spaced = value.replace(/_/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function formatFee(amount: number | null, currency: string): string | null {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return null;
  return `${currency} ${n.toLocaleString("en-US")}`;
}

function degreeLevelOf(card: CourseCardType): string {
  if (card.degree_level) return prettify(card.degree_level);
  const m = /\b(Graduate Certificate|Graduate Diploma|Bachelor|Master|Doctor|PhD|Diploma|Certificate|Associate)\b/i
    .exec(card.course_name);
  return m?.[0] ?? "";
}

function toCompareItem(card: CourseCardType): CompareCourseItem {
  return {
    id: card.id ?? `${card.institution_name}-${card.course_name}`,
    slug: card.slug ?? "",
    name: card.course_name,
    institutionName: card.institution_name,
    institutionLogoUrl: card.institution_logo_url,
    countryName: card.country,
    durationLabel: card.duration || null,
    nextIntakeLabel: card.intakes[0],
    annualTuition: card.annual_tuition_fee,
    feeCurrency: card.currency || undefined,
  };
}

export function CourseCard({ card }: CourseCardProps) {
  const compare = useCompareTray();
  const compareItem = toCompareItem(card);
  const added = compare.has(compareItem.id);

  const fee = formatFee(card.annual_tuition_fee, card.currency);
  const place = [card.city, card.country].filter(Boolean).join(", ");
  const nextIntake = card.intakes[0] ?? null;
  const studyMode = card.study_modes?.[0] ? prettify(card.study_modes[0]) : null;
  const degreeLabel = degreeLevelOf(card);

  const href = card.slug ? `/course/${card.slug}` : (card.source_url ?? null);
  const isExternal = !card.slug && !!card.source_url;

  return (
    <Card className="group relative flex h-full w-full flex-col overflow-hidden rounded-2xl border-0 bg-card pt-0 shadow-md ring-1 ring-border/60 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:ring-primary/30">
      {/* Card-wide clickable overlay */}
      {href && (
        isExternal
          ? <a href={href} target="_blank" rel="noopener noreferrer" className="absolute inset-0 z-0" aria-label={card.course_name} />
          : <Link href={href} className="absolute inset-0 z-0" aria-label={card.course_name} />
      )}

      {/* Cover — real image or gradient fallback */}
      <div className="relative h-24 w-full shrink-0 overflow-hidden">
        {card.institution_cover_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={card.institution_cover_url}
            alt={card.institution_name}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-primary/30 via-primary/15 to-indigo-500/10" />
        )}
        {/* Scrim so text below reads cleanly */}
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-card via-card/20 to-transparent" />
      </div>

      {/* Logo — overlaps the cover/body boundary */}
      <div className="relative z-10 -mt-5 px-4">
        <InstitutionLogo
          name={card.institution_name}
          logoUrl={card.institution_logo_url}
          className="size-10 rounded-xl ring-2 ring-card shadow-sm"
        />
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-2.5 px-4 pb-3 pt-2">
        {/* Institution + location */}
        <div>
          <p className="truncate text-xs font-semibold text-foreground" title={card.institution_name}>
            {card.institution_name}
          </p>
          {place && (
            <p className="mt-0.5 flex items-center gap-0.5 text-[11px] text-muted-foreground">
              <MapPin className="size-3 shrink-0" />
              <span className="truncate">{place}</span>
            </p>
          )}
        </div>

        {/* Divider */}
        <div className="h-px bg-border/60" />

        {/* Course name */}
        <p className="line-clamp-2 text-sm font-bold leading-snug text-foreground" title={card.course_name}>
          {card.course_name}
        </p>

        {/* Badges row */}
        <div className="flex flex-wrap gap-1.5">
          {degreeLabel && (
            <Badge variant="secondary" className="gap-1 border-0 bg-primary/10 text-[10px] font-medium text-primary">
              <GraduationCap className="size-3" />{degreeLabel}
            </Badge>
          )}
          {studyMode && (
            <Badge variant="secondary" className="gap-1 border-0 bg-muted text-[10px] font-medium text-muted-foreground">
              <Monitor className="size-3" />{studyMode}
            </Badge>
          )}
        </div>

        {/* Fee + meta — pushed to bottom */}
        <div className="mt-auto flex flex-col gap-1.5 pt-1">
          {fee && (
            <div className="flex items-center justify-between rounded-lg bg-primary/[0.07] px-3 py-1.5">
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Tuition / yr</span>
              <span className="text-sm font-bold tabular-nums text-foreground">{fee}</span>
            </div>
          )}
          {(card.duration || nextIntake) && (
            <div className="flex flex-wrap gap-x-3 gap-y-1 px-0.5">
              {card.duration && (
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Clock className="size-3 shrink-0" />{card.duration}
                </span>
              )}
              {nextIntake && (
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <CalendarDays className="size-3 shrink-0" />Intake: {nextIntake}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="relative z-10 flex justify-end border-t border-border/50 bg-muted/20 px-3 py-1.5">
        <Button
          variant={added ? "secondary" : "ghost"}
          size="sm"
          className="h-6 gap-1 px-2 text-[11px]"
          disabled={added || compare.isFull}
          onClick={() => compare.add(compareItem)}
        >
          {added ? <><Check className="size-3" /> Added</> : <><Plus className="size-3" /> Compare</>}
        </Button>
      </div>
    </Card>
  );
}
