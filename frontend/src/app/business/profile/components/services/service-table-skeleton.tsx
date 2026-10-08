/** Placeholder rows in the table's shape while a page loads. */
export function ServiceTableSkeleton({ columns }: Readonly<{ columns: number }>) {
  return (
    <div className="overflow-hidden rounded-xl border" aria-busy="true" aria-label="Loading services">
      <div className="h-10 border-b bg-muted" />
      {Array.from({ length: 6 }, (_, r) => (
        <div key={r} className="flex animate-pulse items-center gap-4 border-b p-3 last:border-0" style={{ animationDelay: `${r * 80}ms` }}>
          <div className="size-4 rounded bg-muted" />
          <div className="h-8 w-10 shrink-0 rounded-lg bg-muted" />
          <div className="flex min-w-0 flex-[3] flex-col gap-1.5">
            <div className="h-3 w-3/4 rounded bg-muted" />
            <div className="h-2.5 w-1/3 rounded bg-muted" />
          </div>
          {Array.from({ length: columns }, (_, c) => <div key={c} className="h-3 flex-1 rounded bg-muted" />)}
        </div>
      ))}
    </div>
  );
}
