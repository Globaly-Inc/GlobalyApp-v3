/** First item, then a "+N" chip; the full list is the tooltip — keeps long cells from widening the table. */
export function FirstPlusMore({ items, empty }: Readonly<{ items: string[]; empty: string }>) {
  const [first, ...rest] = items;
  if (!first) return <span className="text-muted-foreground">{empty}</span>;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap" title={items.join("\n")}>
      <span className="block max-w-65 truncate">{first}</span>
      {rest.length > 0 && (
        <span className="shrink-0 rounded-full bg-muted px-1.5 py-px font-mono text-[10px] font-semibold text-muted-foreground">+{rest.length}</span>
      )}
    </span>
  );
}
