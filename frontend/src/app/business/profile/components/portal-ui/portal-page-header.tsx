/** Tab header from the mockup: heading-font title, mono count pill, muted subtitle, action(s) right. */
export function PortalPageHeader({
  title, count, subtitle, children,
}: Readonly<{ title: string; count?: number | null; subtitle?: React.ReactNode; children?: React.ReactNode }>) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="flex items-center gap-2.5 text-[26px] font-bold leading-tight">
          {title}
          {count != null && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 font-mono text-xs font-semibold tabular-nums text-primary">{count}</span>
          )}
        </h2>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}
