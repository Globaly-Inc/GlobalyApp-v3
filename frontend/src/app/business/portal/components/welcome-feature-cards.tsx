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
      <div className="flex items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1.5 text-[11px] text-white/80">
        <Globe className="h-3 w-3 text-[#23DDF6]" />
        yourcollege.edu
      </div>
      {rows.map((label, i) => (
        <div key={label} className="flex items-center gap-2">
          <span className="w-12 text-[10px] text-white/60">{label}</span>
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
            <span className={cn(styles.fillBar, "block h-full origin-left rounded-full bg-gradient-to-r from-[#23DDF6] to-[#7FA6FF]")} style={css({ "--r": i })} />
          </span>
          <Check className={cn(styles.tick, "h-3 w-3 text-emerald-300")} style={css({ "--r": i })} />
        </div>
      ))}
    </div>
  );
}

function CounsellorDemo() {
  return (
    <div className="flex flex-col gap-2 text-[11px] leading-snug">
      <span className={cn(styles.msg, "ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-white/15 px-2.5 py-1.5 text-white/90")}>
        Do you offer scholarships?
      </span>
      <div className="relative min-h-[3.25rem]">
        <span className={cn(styles.typing, "absolute left-0 top-0 flex items-center gap-1 rounded-2xl rounded-bl-sm bg-[#23DDF6]/15 px-3 py-2.5")}>
          {[0, 1, 2].map((d) => (
            <span key={d} className={cn(styles.dot, "h-1.5 w-1.5 rounded-full bg-[#23DDF6]")} style={css({ "--d": `${d * 0.15}s` })} />
          ))}
        </span>
        <span className={cn(styles.reply, "flex max-w-[92%] items-start gap-1.5 rounded-2xl rounded-bl-sm bg-[#23DDF6]/20 px-2.5 py-1.5 text-[#c9f7fd]")}>
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
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#7FA6FF] to-[#23DDF6] text-xs font-bold text-[#012E8A]">A</span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold text-white">Aarav</span>
          <span className="block text-[10px] text-white/60">Nepal · Nursing</span>
        </span>
        <span className="relative h-5 w-14 shrink-0">
          <span className={cn(styles.visitorBadge, "absolute inset-0 flex items-center justify-center rounded-full bg-white/15 text-[10px] font-medium text-white/80")}>Visitor</span>
          <span className={cn(styles.leadBadge, "absolute inset-0 flex items-center justify-center rounded-full bg-emerald-400/90 text-[10px] font-semibold text-emerald-950")}>Lead</span>
        </span>
      </div>
      <span className={cn(styles.msg, "flex w-fit items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1.5 text-[10px] text-white/80")} style={css({ "--m": "0.9s" })}>
        <Mail className="h-3 w-3 text-[#23DDF6]" />
        Shared their contact details
      </span>
    </div>
  );
}

const DEMOS = { autofill: AutoFillDemo, counsellor: CounsellorDemo, leads: LeadsDemo } as const;

export function WelcomeFeatureCards() {
  return (
    <ul className="grid w-full max-w-4xl gap-4 sm:grid-cols-3 lg:flex lg:max-w-md lg:flex-col lg:gap-3">
      {WELCOME_FEATURES.map(({ id, icon: Icon, tag, label, description }, i) => {
        const Demo = DEMOS[id];
        return (
          <li
            key={id}
            className={cn(styles.rise, "group rounded-3xl bg-gradient-to-b from-white/30 via-white/5 to-transparent p-px transition-[translate] duration-300 hover:-translate-y-1.5 lg:w-[90%]", i % 2 === 1 ? "lg:self-end" : "lg:self-start")}
            style={css({ "--delay": `${2.1 + i * 0.2}s`, "--cycle-delay": `${2.7 + i * 0.2}s` })}
          >
            <div className={cn("relative h-full overflow-hidden rounded-[calc(1.5rem-1px)] bg-[#031a55]/80 p-4 text-left backdrop-blur-xl lg:flex lg:items-center lg:gap-4", i % 2 === 1 && "lg:flex-row-reverse")}>
              <span aria-hidden className="pointer-events-none absolute -right-1 -top-3 select-none text-6xl font-black text-white/[0.05]">0{i + 1}</span>

              <div aria-hidden className="flex h-[8.5rem] flex-col justify-center overflow-hidden rounded-2xl border border-white/10 bg-[#021440]/70 p-3 shadow-inner lg:h-28 lg:w-40 lg:shrink-0 xl:w-48">
                <Demo />
              </div>

              <div className="lg:min-w-0 lg:flex-1">
              <div className="mt-4 flex items-center gap-2 lg:mt-0">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#23DDF6]/15 text-[#23DDF6]">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#23DDF6]">{tag}</span>
              </div>
              <h2 className="mt-2 text-lg font-semibold leading-snug lg:mt-1.5 lg:text-base">{label}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-white/70 lg:text-[13px] lg:leading-snug">{description}</p>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
