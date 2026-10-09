/** Credit figure, big and right-aligned, with a small "credits" label under it. */
export function UnitCredits({ value }: Readonly<{ value: number | null }>) {
  if (value == null) return null;
  return (
    <span className="shrink-0 text-right text-[15px] font-bold leading-none tabular-nums">
      {value}
      <small className="block font-mono text-[10px] font-medium text-muted-foreground">credits</small>
    </span>
  );
}
