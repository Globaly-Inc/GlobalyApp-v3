/** Mockup `.empty`: dashed box, bold line over a muted hint. */
export function TeamEmpty({ title, hint }: Readonly<{ title: string; hint: string }>) {
  return (
    <div className="grid justify-items-center gap-1.5 rounded-[14px] border-[1.5px] border-dashed p-7.5 text-center text-sm text-muted-foreground">
      <b className="text-foreground">{title}</b>
      <span>{hint}</span>
    </div>
  );
}
