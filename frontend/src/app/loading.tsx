export default function Loading() {
  return (
    <div className="flex flex-1 items-center justify-center py-32">
      <output
        aria-label="Loading"
        className="size-8 animate-spin rounded-full border-2 border-border border-t-foreground"
      />
    </div>
  );
}
