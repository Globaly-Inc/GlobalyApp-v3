"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { removeFromCompare, clearCompare } from "../store/ai-chat-slice";
import { useState } from "react";

export function CompareTray() {
  const dispatch = useAppDispatch();
  const tray = useAppSelector((s) => s.aiChat.compareTray);
  const [expanded, setExpanded] = useState(false);

  if (tray.length < 2) return null;

  return (
    <div className="border-t bg-card px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium">Compare courses ({tray.length}/4)</span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setExpanded(!expanded)}>
            {expanded ? "Collapse" : "Compare"}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => dispatch(clearCompare())}>
            Clear
          </Button>
        </div>
      </div>

      {!expanded && (
        <div className="flex gap-2 overflow-x-auto">
          {tray.map((card, i) => (
            <div key={`${card.institution_name}-${card.course_name}`} className="flex items-center gap-1.5 rounded-full border bg-muted/50 px-2.5 py-1 text-xs shrink-0">
              <span className="max-w-[120px] truncate">{card.course_name}</span>
              <button type="button" onClick={() => dispatch(removeFromCompare(i))} className="cursor-pointer text-muted-foreground hover:text-foreground">
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {expanded && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b">
                <th className="py-2 pr-4 text-left font-medium text-muted-foreground" />
                {tray.map((card) => (
                  <th key={`${card.institution_name}-${card.course_name}`} className="py-2 px-3 text-left font-medium min-w-[160px]">
                    {card.course_name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b">
                <td className="py-1.5 pr-4 font-medium text-muted-foreground">Institution</td>
                {tray.map((c) => <td key={c.institution_name} className="py-1.5 px-3">{c.institution_name}</td>)}
              </tr>
              <tr className="border-b">
                <td className="py-1.5 pr-4 font-medium text-muted-foreground">Degree</td>
                {tray.map((c) => <td key={c.course_name + "-deg"} className="py-1.5 px-3"><Badge variant="secondary">{c.degree_level}</Badge></td>)}
              </tr>
              <tr className="border-b">
                <td className="py-1.5 pr-4 font-medium text-muted-foreground">Duration</td>
                {tray.map((c) => <td key={c.course_name + "-dur"} className="py-1.5 px-3">{c.duration}</td>)}
              </tr>
              <tr className="border-b">
                <td className="py-1.5 pr-4 font-medium text-muted-foreground">Fees</td>
                {tray.map((c) => <td key={c.course_name + "-fee"} className="py-1.5 px-3">{c.annual_tuition_fee != null ? `${c.currency} ${c.annual_tuition_fee.toLocaleString()}/yr` : "N/A"}</td>)}
              </tr>
              <tr className="border-b">
                <td className="py-1.5 pr-4 font-medium text-muted-foreground">Country</td>
                {tray.map((c) => <td key={c.course_name + "-cty"} className="py-1.5 px-3">{c.country}</td>)}
              </tr>
              <tr>
                <td className="py-1.5 pr-4 font-medium text-muted-foreground">Intakes</td>
                {tray.map((c) => <td key={c.course_name + "-int"} className="py-1.5 px-3">{c.intakes.join(", ") || "\u2014"}</td>)}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
