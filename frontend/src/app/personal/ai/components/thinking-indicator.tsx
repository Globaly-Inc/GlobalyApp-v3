"use client";

type ThinkingIndicatorProps = {
  steps: string[];
};

// Raw trace steps are engineering strings from the RAG pipeline ("Keywords: …",
// "Context: 6149 chars, 10 sources"). Map them to student-friendly phases;
// first match wins, unknown steps stay a generic "Thinking".
//
// Tool-loop steps ("Searching courses…", "Searched knowledge base: … — 4 found")
// are already student-readable, so they pass through with the detail trimmed off
// instead of being flattened into a generic phase.
const TOOL_STEP = /^(Searching|Searched|Reading|Read) [a-z]/;
const PHASES: Array<[RegExp, string]> = [
  [/^(Keywords|Country detected|No searchable)/, "Understanding your question"],
  [/^Hydrat/, "Gathering course details"],
  [/^Context:/, "Putting it all together"],
  [/found|skipped|failed/, "Searching courses, visas and knowledge"],
];

const friendly = (step: string) => {
  if (TOOL_STEP.test(step)) return (step.split(/[:…]/)[0] ?? step).trim();
  return PHASES.find(([re]) => re.test(step))?.[1] ?? "Thinking";
};

export function ThinkingIndicator({ steps }: ThinkingIndicatorProps) {
  const lastStep = steps.at(-1);
  const latest = lastStep ? friendly(lastStep) : "Thinking";

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
