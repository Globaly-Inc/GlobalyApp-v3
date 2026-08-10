export function ComingSoon({ title }: Readonly<{ title: string }>) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-2 text-center">
      <h1 className="text-2xl font-bold text-foreground">{title}</h1>
      <p className="text-muted-foreground">Coming soon.</p>
    </div>
  );
}
