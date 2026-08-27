import { CheckCircle2, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ReadinessRow } from "../apis/types";

const CHECKS: Array<{ key: keyof ReadinessRow; label: string }> = [
  { key: "hasFaqSection", label: "FAQ section" },
  { key: "hasFaqJsonLd", label: "FAQPage JSON-LD" },
  { key: "hasAnswerShapedIntro", label: "Answer-shaped intro" },
  { key: "hasMetaDescription", label: "Meta description" },
];

function CheckItem({ passed, label }: Readonly<{ passed: boolean; label: string }>) {
  const Icon = passed ? CheckCircle2 : XCircle;
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${passed ? "text-emerald-600" : "text-muted-foreground"}`}>
      <Icon className="h-3.5 w-3.5 shrink-0" />
      {label}
    </span>
  );
}

export function ReadinessChecklist({ readiness }: Readonly<{ readiness: ReadinessRow[] }>) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">AEO readiness</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-xs text-muted-foreground">
          A readiness score, not a ranking — how likely an AI answer engine is to quote this post.
        </p>
        {readiness.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No published posts yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {readiness.map((post) => (
              <li key={post.id} className="rounded-md border border-border px-3 py-2.5">
                <div className="mb-1.5 flex items-center justify-between gap-3">
                  <span className="truncate text-sm font-medium text-foreground">{post.title}</span>
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
                    {post.score}/100
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {CHECKS.map(({ key, label }) => (
                    <CheckItem key={key} passed={!!post[key]} label={label} />
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
