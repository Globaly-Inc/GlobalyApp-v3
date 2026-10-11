import { Bot, Check, Globe, Mail } from "lucide-react";
import { cn } from "@/lib/utils";
import { WELCOME_FEATURES } from "../const";
import styles from "./welcome-tour.module.css";

const css = (vars: Record<string, string | number>) => vars as React.CSSProperties;

/*
 * Each card carries a tiny looping demo of its feature. They are illustrations with sample text,
 * not live data, and all hidden from assistive tech (the title and description say the same thing).
 * With reduced motion the animations are off and every demo rests in its finished state.
 */

function AutoFillDemo() {
  const rows = ["Courses", "Fees", "Intakes"];
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1.5 text-xs text-white/80">
        <Globe className="h-3 w-3 text-[hsl(var(--gold))]" />
        yourcollege.edu
      </div>
      {rows.map((label, i) => (
        <div key={label} className="flex items-center gap-2">
          <span className="w-12 text-xs text-white/60">{label}</span>
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
            <span className={cn(styles.fillBar, "block h-full origin-left rounded-full bg-gradient-to-r from-[hsl(var(--gold))] to-[hsl(var(--primary-bright))]")} style={css({ "--r": i })} />
          </span>
          <Check className={cn(styles.tick, "h-3 w-3 text-success")} style={css({ "--r": i })} />
        </div>
      ))}
    </div>
  );
}

function CounsellorDemo() {
  return (
    <div className="flex flex-col gap-2 text-xs leading-snug">
      <span className={cn(styles.msg, "ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-white/15 px-2.5 py-1.5 text-white/90")}>
        Do you offer scholarships?
      </span>
      <div className="relative min-h-[3.25rem]">
        <span className={cn(styles.typing, "absolute left-0 top-0 flex items-center gap-1 rounded-2xl rounded-bl-sm bg-[hsl(var(--gold)/0.15)] px-3 py-2.5")}>
          {[0, 1, 2].map((d) => (
            <span key={d} className={cn(styles.dot, "h-1.5 w-1.5 rounded-full bg-[hsl(var(--gold))]")} style={css({ "--d": `${d * 0.15}s` })} />
          ))}
        </span>
        <span className={cn(styles.reply, "flex max-w-[92%] items-start gap-1.5 rounded-2xl rounded-bl-sm bg-[hsl(var(--gold)/0.2)] px-2.5 py-1.5 text-white/90")}>
          <Bot className="mt-0.5 h-3 w-3 shrink-0" />
          Yes! Here are the options for international students.
        </span>
      </div>
    </div>
  );
}

function LeadsDemo() {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[hsl(var(--primary-bright))] to-[hsl(var(--gold))] text-xs font-bold text-[#012E8A]">A</span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold text-white">Aarav</span>
          <span className="block text-xs text-white/60">Nepal · Nursing</span>
        </span>
        <span className="relative h-5 w-14 shrink-0">
          <span className={cn(styles.visitorBadge, "absolute inset-0 flex items-center justify-center rounded-full bg-white/15 text-xs font-medium text-white/80")}>Visitor</span>
          <span className={cn(styles.leadBadge, "absolute inset-0 flex items-center justify-center rounded-full bg-success text-xs font-semibold text-success-foreground")}>Lead</span>
        </span>
      </div>
      <span className={cn(styles.msg, "flex w-fit items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1.5 text-xs text-white/80")} style={css({ "--m": "0.9s" })}>
        <Mail className="h-3 w-3 text-[hsl(var(--gold))]" />
        Shared their contact details
      </span>
    </div>
  );
}

const DEMOS = { autofill: AutoFillDemo, counsellor: CounsellorDemo, leads: LeadsDemo } as const;

type Feature = (typeof WELCOME_FEATURES)[number];

/** The act-three card: the panelled one the splash settles into, three to a column. */
function StackCard({ feature, index }: Readonly<{ feature: Feature; index: number }>) {
  const { id, icon: Icon, tag, label, description } = feature;
  const Demo = DEMOS[id];
  return (
    <li
      className={cn(
        styles.rise, styles.stackCard,
        "group rounded-3xl bg-gradient-to-b from-white/30 via-white/5 to-transparent p-px transition-[translate] duration-300 hover:-translate-y-1.5 lg:w-[90%]",
        index % 2 === 1 ? "lg:self-end" : "lg:self-start",
      )}
      style={css({ "--delay": `${2.1 + index * 0.2}s`, "--cycle-delay": `${2.7 + index * 0.2}s`, "--i": index })}
    >
      <div className={cn("relative h-full overflow-hidden rounded-[calc(1.5rem-1px)] bg-[#031a55]/80 p-4 text-left backdrop-blur-xl lg:flex lg:items-center lg:gap-4", index % 2 === 1 && "lg:flex-row-reverse")}>
        <span aria-hidden className="pointer-events-none absolute -right-1 -top-3 select-none text-6xl font-black text-white/[0.05]">0{index + 1}</span>

        <div aria-hidden className="flex h-[8.5rem] flex-col justify-center overflow-hidden rounded-2xl border border-white/10 bg-[#021440]/70 p-3 shadow-inner lg:h-28 lg:w-40 lg:shrink-0 xl:w-48">
          <Demo />
        </div>

        <div className="lg:min-w-0 lg:flex-1">
          <div className="mt-4 flex items-center gap-2 lg:mt-0">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[hsl(var(--gold)/0.15)] text-[hsl(var(--gold))]">
              <Icon className="h-4 w-4" aria-hidden />
            </span>
            <span className="text-xs font-bold uppercase tracking-[0.14em] text-[hsl(var(--gold))]">{tag}</span>
          </div>
          <h2 className="mt-2 text-lg font-semibold leading-snug lg:mt-1.5 lg:text-base">{label}</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-white/70 lg:text-[13px] lg:leading-snug">{description}</p>
        </div>
      </div>
    </li>
  );
}

/**
 * The act-two card: an editorial spread, not a bigger panel. No border, no backdrop — the splash's
 * own gradient is the page — with an oversized ghost numeral for a drop cap and the demo carrying
 * the weight. Only the block moves; everything else is the demo's own loop.
 */
function SpreadCard({ feature, index }: Readonly<{ feature: Feature; index: number }>) {
  const { id, icon: Icon, tag, label, description } = feature;
  const Demo = DEMOS[id];
  return (
    <li className={styles.spreadCard} style={css({ "--cycle-delay": "0s" })}>
      <div className="relative flex items-center justify-center gap-12">
        <span aria-hidden className="pointer-events-none absolute -top-20 -left-4 select-none text-[9.875rem] leading-none font-black tracking-tighter text-white/[0.07]">
          0{index + 1}
        </span>

        <div
          aria-hidden
          className="flex h-68 w-96 shrink-0 flex-col justify-center overflow-hidden rounded-[1.375rem] border border-white/20 bg-[#021440]/80 p-5 shadow-[0_34px_80px_rgba(2,12,45,0.55),0_0_70px_rgba(166,203,253,0.14)]"
        >
          <Demo />
        </div>

        <div className="min-w-0 max-w-md text-left">
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[hsl(var(--gold)/0.15)] text-[hsl(var(--gold))]">
              <Icon className="h-5 w-5" aria-hidden />
            </span>
            <span className="text-xs font-bold tracking-[0.22em] text-[hsl(var(--gold))] uppercase">{tag}</span>
          </div>
          <h2 className="mt-3.5 max-w-[16ch] font-heading text-4xl leading-tight font-semibold tracking-tight text-balance">{label}</h2>
          <p className="mt-3 max-w-[44ch] text-[17px] leading-relaxed text-white/80">{description}</p>
        </div>
      </div>
    </li>
  );
}

/** Act two: each feature alone at centre stage, one after another, over the whole splash. */
export function WelcomeFeatureSpread() {
  return (
    <div aria-hidden className={cn(styles.bigpager, "pointer-events-none absolute inset-0 flex-col items-center justify-center px-10")}>
      <ul className={cn(styles.pstage, "relative h-120 w-full max-w-[58rem] list-none overflow-hidden py-24")}>
        {WELCOME_FEATURES.map((f, i) => <SpreadCard key={f.id} feature={f} index={i} />)}
      </ul>
    </div>
  );
}

/** Act three: the three exactly as the splash ships them. */
export function WelcomeFeatureCards() {
  return (
    <ul className="grid w-full max-w-4xl gap-4 sm:grid-cols-3 lg:flex lg:max-w-md lg:flex-col lg:gap-3">
      {WELCOME_FEATURES.map((f, i) => <StackCard key={f.id} feature={f} index={i} />)}
    </ul>
  );
}
