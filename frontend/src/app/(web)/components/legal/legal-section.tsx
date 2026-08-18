import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Reveal } from "../reveal";

interface LegalSectionProps {
  id: string;
  icon: LucideIcon;
  title: string;
  children: ReactNode;
}

export function LegalSection({ id, icon: Icon, title, children }: Readonly<LegalSectionProps>) {
  return (
    <Reveal>
      <section id={id} className="scroll-mt-24 border-b border-border/60 py-8 first:pt-0 last:border-b-0">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="size-4.5" />
          </div>
          <h2 className="text-xl font-semibold">{title}</h2>
        </div>
        <div className="space-y-4 pl-12 text-muted-foreground [&_a]:text-primary [&_a]:hover:underline [&_li]:pl-1 [&_strong]:text-foreground [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">
          {children}
        </div>
      </section>
    </Reveal>
  );
}
