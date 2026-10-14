import Link from "next/link";
import { ChevronRight, GraduationCap } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { TableCell, TableRow } from "@/components/ui/table";
import { EnquiryStatusBadge } from "./enquiry-status-badge";
import { formatDate, intakeLabel } from "../utils";

import type { EnquiryListItem } from "../apis/types";

/** Column headers for the rows below — kept beside the row so the two can't drift apart. */
export const ENQUIRY_COLUMNS = [
  { label: "Course" },
  { label: "Intake", className: "hidden md:table-cell" },
  { label: "Sent", className: "hidden md:table-cell" },
  { label: "Status" },
  { label: "Open", className: "w-px", srOnly: true },
] as const;

export function EnquiryRow({ enquiry }: Readonly<{ enquiry: EnquiryListItem }>) {
  // Full course name is the headline — never the short code (EMHA/MSBA mean
  // nothing at a glance) and never the intake. Institution sits beneath it, with
  // the date and intake kept as secondary columns since they're still useful.
  const intake = intakeLabel(enquiry.preferred_intake, enquiry.preferred_year);

  return (
    // The course name's link stretches over the whole row (`after:inset-0`), so the row opens the
    // detail page on click while keyboard and screen-reader users get one real link per row.
    <TableRow className="group relative cursor-pointer has-[a:focus-visible]:bg-muted/50">
      <TableCell primary>
        <div className="flex min-w-0 items-center gap-3">
          <Avatar className="size-9 rounded-lg">
            {enquiry.institution_logo_url && (
              <AvatarImage src={enquiry.institution_logo_url} alt="" className="bg-card object-contain p-1" />
            )}
            <AvatarFallback className="rounded-lg bg-primary-light text-primary">
              <GraduationCap className="size-4" aria-hidden />
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <Link
                href={`/personal/enquiries/${enquiry.id}`}
                className="truncate font-medium text-foreground outline-none after:absolute after:inset-0"
              >
                {enquiry.course_name}
              </Link>
              {enquiry.course_short_name && (
                <Badge variant="outline" className="shrink-0 font-normal text-muted-foreground">
                  {enquiry.course_short_name}
                </Badge>
              )}
            </div>
            {enquiry.institution_name && (
              <p className="truncate text-xs text-muted-foreground">{enquiry.institution_name}</p>
            )}
            <p className="truncate text-xs text-muted-foreground md:hidden">
              {intake ? `${intake} · ` : ""}Sent {formatDate(enquiry.created_at)}
            </p>
          </div>
        </div>
      </TableCell>
      <TableCell className="hidden text-muted-foreground md:table-cell">{intake ?? "—"}</TableCell>
      <TableCell className="hidden text-muted-foreground md:table-cell">{formatDate(enquiry.created_at)}</TableCell>
      <TableCell>
        <EnquiryStatusBadge status={enquiry.status} />
      </TableCell>
      <TableCell className="pl-0">
        <ChevronRight
          className="size-4 text-muted-foreground/40 transition-all group-hover:translate-x-0.5 group-hover:text-muted-foreground"
          aria-hidden
        />
      </TableCell>
    </TableRow>
  );
}
