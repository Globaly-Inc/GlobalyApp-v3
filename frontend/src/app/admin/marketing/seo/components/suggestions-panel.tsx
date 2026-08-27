import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Suggestion } from "../apis/types";

export function SuggestionsPanel({ suggestions }: Readonly<{ suggestions: Suggestion[] }>) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Suggested keywords</CardTitle>
      </CardHeader>
      <CardContent>
        {suggestions.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No suggestions yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {suggestions.map((s) => (
              <li key={`${s.source}-${s.keyword}`} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <Badge variant={s.source === "gsc" ? "default" : "secondary"} className="shrink-0 uppercase">
                    {s.source}
                  </Badge>
                  <span className="truncate text-sm font-medium text-foreground">{s.keyword}</span>
                </div>
                {(s.impressions !== undefined || s.position !== undefined) && (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {s.impressions !== undefined && `${s.impressions.toLocaleString()} impr.`}
                    {s.impressions !== undefined && s.position !== undefined && " · "}
                    {s.position !== undefined && `pos ${s.position.toFixed(1)}`}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
