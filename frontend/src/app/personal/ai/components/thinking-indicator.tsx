"use client";

type ThinkingIndicatorProps = {
  steps: string[];
};

export function ThinkingIndicator({ steps }: ThinkingIndicatorProps) {
  const latest = steps.length > 0 ? steps[steps.length - 1] : "Thinking";

  return (
    <div className="flex w-fit items-center gap-2 rounded-2xl rounded-bl-md border bg-muted/60 px-4 py-2.5 text-sm text-muted-foreground shadow-xs">
      <span className="inline-flex gap-1">
        {[0, 150, 300].map((delay) => (
          <span
            key={delay}
            className="size-1.5 animate-bounce rounded-full bg-primary/60"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </span>
      <span className="animate-pulse">{latest}...</span>
    </div>
  );
}
