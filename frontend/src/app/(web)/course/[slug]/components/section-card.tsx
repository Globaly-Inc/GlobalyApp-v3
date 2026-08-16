import type { LucideIcon } from "lucide-react";

export function SectionCard({
  icon: Icon, title, children,
}: Readonly<{ icon: LucideIcon; title: string; children: React.ReactNode }>) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </div>
      {children}
    </div>
  );
}
