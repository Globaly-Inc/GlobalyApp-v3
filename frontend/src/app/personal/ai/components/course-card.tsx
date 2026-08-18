"use client";

import Link from "next/link";
import { ArrowRight, Banknote, CalendarDays, Clock, ExternalLink, GraduationCap, MapPin } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCompareTray } from "@/app/(web)/search/use-compare-tray";
import type { CompareCourseItem } from "@/app/(web)/search/types";
import type { CourseCard as CourseCardType } from "../apis/types";

type CourseCardProps = {
  card: CourseCardType;
};

/** "on_campus" → "On campus", "full_time" → "Full time" — wire enums are not for humans. */
function prettify(value: string): string {
  const spaced = value.replace(/_/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function formatFee(amount: number | null, currency: string): string | null {
  if (amount == null) return null;
  return `${currency} ${amount.toLocaleString()} / year`;
}

function DetailRow({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="truncate text-xs text-foreground" title={value}>{value}</p>
      </div>
    </div>
  );
}

/** AI card → the shared compare store's item shape (same store as the search page). */
function toCompareItem(card: CourseCardType): CompareCourseItem {
  return {
    id: card.id ?? `${card.institution_name}-${card.course_name}`,
    slug: card.slug ?? "",
    name: card.course_name,
    institutionName: card.institution_name,
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
  const modes = card.study_modes.map(prettify).join(" · ");
  const hasDetails = Boolean(card.duration || fee || card.intakes.length > 0 || modes);

  return (
    <Card size="sm" className="w-full gap-0 overflow-hidden py-0">
      {/* Header */}
      <div className="border-b bg-muted/40 px-4 py-3">
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <GraduationCap className="size-3.5" /> {card.institution_name}
        </p>
        <p className="mt-0.5 font-medium leading-snug">{card.course_name}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {card.degree_level && <Badge variant="secondary">{prettify(card.degree_level)}</Badge>}
          {card.country && (
            <Badge variant="outline">
              <MapPin className="size-3" /> {card.country}
            </Badge>
          )}
        </div>
      </div>

      {/* Details — two-column grid keeps rows aligned; section disappears entirely
          when the card has none of the fields (no empty padded band). */}
      {hasDetails && (
        <CardContent className="grid grid-cols-2 gap-x-4 gap-y-2.5 px-4 py-3">
          {card.duration && <DetailRow icon={Clock} label="Duration" value={card.duration} />}
          {fee && <DetailRow icon={Banknote} label="Tuition" value={fee} />}
          {card.intakes.length > 0 && (
            <DetailRow icon={CalendarDays} label="Intakes" value={card.intakes.join(", ")} />
          )}
          {modes && <DetailRow icon={GraduationCap} label="Study mode" value={modes} />}
        </CardContent>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between border-t px-4 py-2">
        {card.slug ? (
          <Button
            variant="link"
            size="sm"
            className="p-0"
            render={<Link href={`/course/${card.slug}`} target="_blank" rel="noopener noreferrer" />}
          >
            View Details <ArrowRight />
          </Button>
        ) : card.source_url ? (
          <Button
            variant="link"
            size="sm"
            className="p-0"
            render={<a href={card.source_url} target="_blank" rel="noopener noreferrer" />}
          >
            View Details <ExternalLink />
          </Button>
        ) : (
          <span />
        )}
        <Button
          variant="outline"
          size="sm"
          disabled={added || compare.isFull}
          onClick={() => compare.add(compareItem)}
        >
          {added ? "Added ✓" : "Compare"}
        </Button>
      </div>
    </Card>
  );
}
