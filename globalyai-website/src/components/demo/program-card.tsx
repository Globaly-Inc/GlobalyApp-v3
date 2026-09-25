import Image from "next/image";
import { Building2, CalendarDays, GraduationCap, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A program as the product actually presents one: the course card.
 *
 * The film used to list the two programs it narrows to as plain rows — an icon,
 * a name, a line of meta. That is not what a student is shown. In the product a
 * suggestion arrives as a card with the institution on it, the award and study
 * mode, the intake and the fee, over a picture of the place. Those five facts
 * are the ones that decide whether an applicant keeps reading, so the demo now
 * shows them rather than describing two programs in the abstract.
 *
 * Two things from the marketplace card are deliberately left off: the compare
 * control and the second institution logo. This card is inside one
 * institution's own assistant, where there is nothing to compare across and one
 * crest to show.
 *
 * Sized for the 320px panel the film runs in, so it is the short crop of the
 * card rather than a smaller copy of it: the photograph is the card's ground at
 * any height, and the type scale is held where it stays legible.
 */
export type DemoProgram = {
  name: string;
  /** Award level, as the card's first badge. */
  level: string;
  /** Study mode, as the second. */
  mode: string;
  intake: string;
  /** Rendered bold at the foot, the way the product prices a course. */
  fee: string;
  /** Per what — kept separate so it can be set smaller than the figure. */
  per: string;
  /** Under /public/imagery. Dark frames: the card writes white on top of them. */
  image: string;
};

/**
 * The two programs the film narrows to.
 *
 * The institution is unnamed on purpose — the browser frame around this is
 * your-university.edu, and the note under the film says programs, wording and
 * branding are configured per institution. The figures are illustrative for the
 * same reason: there is no real prospectus behind this conversation.
 */
export const DEMO_PROGRAMS: readonly DemoProgram[] = [
  {
    name: "Full-time MBA",
    level: "Master's",
    mode: "On campus",
    intake: "September",
    fee: "£32,000",
    per: "/yr",
    image: "/imagery/v5-universities.webp",
  },
  {
    name: "MSc Management",
    level: "Master's",
    mode: "On campus",
    intake: "September",
    fee: "£24,500",
    per: "/yr",
    image: "/imagery/v5-colleges.webp",
  },
];

export function ProgramCard({
  program,
  size = "sm",
  className,
}: Readonly<{ program: DemoProgram; size?: "sm" | "md"; className?: string }>) {
  const { name, level, mode, intake, fee, per, image } = program;
  const md = size === "md";

  return (
    <article
      className={cn(
        // #101623 under the photograph rather than nothing: the cards mount
        // mid-play, so the frame has to be right in the moment before the
        // image paints.
        "relative isolate overflow-hidden rounded-[14px] bg-[#101623] shadow-soft",
        className,
      )}
    >
      <Image src={image} alt="" fill sizes={md ? "420px" : "300px"} className="object-cover" />

      {/* Two scrims, not one: a flat wash would leave the crest chip sitting on
          open sky, and a single bottom gradient leaves the top of the picture
          too bright for the white type in the corner. */}
      <span aria-hidden="true" className="absolute inset-0 bg-[#080d18]/45" />
      <span
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(to_top,rgb(6_10_20/0.92)_18%,rgb(6_10_20/0.55)_58%,rgb(6_10_20/0.2))]"
      />

      <div className={cn("relative flex flex-col", md ? "gap-1.5 p-3" : "gap-1.5 p-2.5")}>
        <div className="flex items-center gap-1.5">
          {/* The institution's crest slot. A drawn mark, like everything else
              in these demos — no real school's badge appears here. */}
          <span
            className={cn(
              "flex shrink-0 items-center justify-center rounded-[5px] bg-white/95",
              md ? "h-[22px] w-[22px]" : "h-[18px] w-[18px]",
            )}
          >
            <GraduationCap
              className={cn("text-[#101623]", md ? "h-3 w-3" : "h-2.5 w-2.5")}
              aria-hidden="true"
            />
          </span>
          <p className={cn("min-w-0 truncate font-semibold text-white/80", md ? "text-[11.5px]" : "text-[10px]")}>
            Your University
          </p>
          <span
            className={cn(
              "ml-auto flex shrink-0 items-center gap-0.5 text-white/60",
              md ? "text-[11px]" : "text-[9.5px]",
            )}
          >
            <MapPin className={md ? "h-3 w-3" : "h-2.5 w-2.5"} aria-hidden="true" />
            City campus
          </span>
        </div>

        <p className={cn("min-w-0 truncate font-bold leading-tight text-white", md ? "text-[15.5px]" : "text-[13px]")}>
          {name}
        </p>

        <div className="flex flex-wrap gap-1">
          <Badge icon={GraduationCap} md={md}>{level}</Badge>
          <Badge icon={Building2} md={md}>{mode}</Badge>
        </div>

        <div className={cn("flex items-center gap-2 border-t border-white/15", md ? "mt-1 pt-2.5" : "mt-0.5 pt-2")}>
          <span className={cn("flex min-w-0 items-center gap-1 text-white/70", md ? "text-[11.5px]" : "text-[9.5px]")}>
            <CalendarDays className={cn("shrink-0", md ? "h-3 w-3" : "h-2.5 w-2.5")} aria-hidden="true" />
            <span className="min-w-0 truncate">Intake: {intake}</span>
          </span>
          <span className={cn("ml-auto shrink-0 font-bold text-white", md ? "text-[13.5px]" : "text-[11px]")}>
            {fee}
            <span className={cn("ml-0.5 font-medium text-white/60", md ? "text-[10.5px]" : "text-[9px]")}>{per}</span>
          </span>
        </div>
      </div>
    </article>
  );
}

function Badge({
  icon: Icon,
  md = false,
  children,
}: Readonly<{ icon: typeof GraduationCap; md?: boolean; children: string }>) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/10 font-medium text-white/85",
        md ? "px-2 py-1 text-[11px]" : "px-1.5 py-0.5 text-[9.5px]",
      )}
    >
      <Icon className={md ? "h-3 w-3" : "h-2.5 w-2.5"} aria-hidden="true" />
      {children}
    </span>
  );
}
