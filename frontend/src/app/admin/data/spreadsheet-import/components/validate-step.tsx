"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { FIELD_BY_KEY } from "../const";
import type { InstitutionGroup, Issue } from "../types";
import { IssueSummary } from "./issue-summary";

/** Rows rendered per institution — enough to fix what's flagged without mounting thousands of inputs. */
const ROW_LIMIT = 100;

export function ValidateStep({
  groups, onGroupsChange, issues, onEditMapping,
}: Readonly<{ groups: InstitutionGroup[]; onGroupsChange: (g: InstitutionGroup[]) => void; issues: Issue[]; onEditMapping: () => void }>) {
  const [onlyErrors, setOnlyErrors] = useState(true);

  const update = (id: string, patch: Partial<InstitutionGroup>) =>
    onGroupsChange(groups.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  const editCell = (g: InstitutionGroup, row: number, field: string, value: string) =>
    update(g.id, { rows: g.rows.map((r, i) => (i === row - 1 ? { ...r, [field]: value || null } : r)) });

  return (
    <div className="flex flex-col gap-4">
      <IssueSummary issues={issues} onEditMapping={onEditMapping} />

      <div className="flex justify-end">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Switch checked={onlyErrors} onCheckedChange={setOnlyErrors} /> Show only rows with problems
        </label>
      </div>

      {groups.map((g) => {
        const own = issues.filter((i) => i.groupId === g.id);
        const nameIssues = own.filter((i) => i.row === 0);
        const nameIssue = nameIssues.find((i) => i.blocking);
        const byRow = new Map<number, Issue[]>();
        for (const i of own) if (i.row > 0) byRow.set(i.row, [...(byRow.get(i.row) ?? []), i]);
        // Plus every field an issue points at — "No currency" has no column of its own otherwise, so
        // the problem had nowhere to show.
        const columns = [...new Set([...g.rows.flatMap((r) => Object.keys(r)), ...own.filter((i) => i.row > 0).map((i) => i.field)])];
        const rows = g.rows.map((r, i) => ({ r, n: i + 1 })).filter(({ n }) => !onlyErrors || byRow.has(n));

        return (
          <div key={g.id} className={cn("rounded-lg border", !g.include && "opacity-60")}>
            <div className="flex flex-wrap items-center gap-3 border-b px-3 py-2">
              <Checkbox checked={g.include} onCheckedChange={(v) => update(g.id, { include: !!v })} title="Import this institution" />
              <Input
                className={cn("h-9 max-w-md font-medium", nameIssue && g.include && "border-destructive")}
                value={g.name}
                onChange={(e) => update(g.id, { name: e.target.value })}
              />
              <span className="text-xs text-muted-foreground">{g.rows.length} courses</span>
              {g.include && nameIssues.map((i) => (
                <span key={i.message} className={cn("text-xs", i.blocking ? "text-destructive" : "text-amber-700")}>{i.message}</span>
              ))}
              {!g.include && <span className="text-xs text-muted-foreground">Skipped</span>}
            </div>

            {g.include && rows.length > 0 && (
              <div className="max-h-80 overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12 text-xs">Row</TableHead>
                      <TableHead className="min-w-56 text-xs">Problems</TableHead>
                      {columns.map((c) => <TableHead key={c} className="whitespace-nowrap text-xs">{FIELD_BY_KEY.get(c)?.label ?? c}</TableHead>)}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.slice(0, ROW_LIMIT).map(({ r, n }) => (
                      <TableRow key={n}>
                        <TableCell className="text-xs text-muted-foreground">{n}</TableCell>
                        <TableCell className="text-xs">
                          {(byRow.get(n) ?? []).map((i) => (
                            <span key={i.field + i.message} className={cn("block", i.blocking ? "text-destructive" : "text-amber-700")}>
                              {FIELD_BY_KEY.get(i.field)?.label ?? i.field}: {i.message}
                            </span>
                          ))}
                        </TableCell>
                        {columns.map((c) => {
                          const cellIssue = byRow.get(n)?.find((i) => i.field === c);
                          if (!cellIssue) return <TableCell key={c} className="max-w-48 truncate text-xs">{r[c]}</TableCell>;
                          return (
                            <TableCell key={c} className="min-w-40">
                              <Input
                                title={cellIssue.message}
                                className={cn("h-8 text-xs", cellIssue.blocking ? "border-destructive" : "border-amber-500")}
                                defaultValue={r[c] ?? ""}
                                // Commit on blur, like the AgentCIS importer: re-validating per keystroke re-renders every table.
                                onBlur={(e) => e.target.value !== (r[c] ?? "") && editCell(g, n, c, e.target.value)}
                              />
                              <span className={cn("mt-0.5 flex items-center gap-1 text-[10px]", cellIssue.blocking ? "text-destructive" : "text-amber-700")}>
                                <AlertTriangle className="h-3 w-3" /> {cellIssue.message}
                              </span>
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {rows.length > ROW_LIMIT && (
                  <p className="px-3 py-2 text-xs text-muted-foreground">Showing {ROW_LIMIT} of {rows.length} rows.</p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
