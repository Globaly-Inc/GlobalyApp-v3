"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAppDispatch } from "@/lib/hooks";
import { VERTICAL_CARD_FIELDS, VERTICAL_PRICE_FIELDS } from "../const";
import { discardVerticalRow } from "../store/service-verticals-slice";
import type { VerticalRow, VerticalSlug } from "../apis/types";
import { PromoteVerticalDialog } from "./promote-vertical-dialog";

/** A number that arrived as a Postgres numeric (which node-pg hands over as text). */
function asAmount(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : null;
}

function display(value: unknown): string {
  if (value === null || value === undefined || value === "") return "--";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "--";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function VerticalRowCard({ row, slug }: { row: VerticalRow; slug: VerticalSlug }) {
  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(false);
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const price = VERTICAL_PRICE_FIELDS[slug];
  const amount = price ? asAmount(row[price.amount]) : null;
  const confidence = row.confidence_score === null ? null : Number(row.confidence_score);

  const handleDiscard = async () => {
    setBusy(true);
    const result = await dispatch(discardVerticalRow({ slug, id: row.id }));
    setBusy(false);
    if ("error" in result && result.error) {
      toast.error("Discard failed");
      return;
    }
    toast.success("Row discarded");
  };

  return (
    <>
      <Card className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium truncate">{row.name}</span>
              {row.provider_name && <Badge variant="outline">{row.provider_name}</Badge>}
              {row.country_code && <Badge>{row.country_code}</Badge>}
              {amount !== null && (
                <Badge variant="secondary">
                  {display(row[price!.currency])} {amount}
                  {price!.period && row[price!.period] ? ` / ${display(row[price!.period])}` : ""}
                </Badge>
              )}
              {confidence !== null && Number.isFinite(confidence) && (
                <Badge variant="secondary">conf {Math.round(confidence * 100)}%</Badge>
              )}
              <Badge variant={row.status === "pending" ? "default" : "outline"}>{row.status}</Badge>
            </div>
            {row.source_url && (
              <a
                href={row.source_url}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1 mt-1"
              >
                source <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
          <Button size="sm" variant="ghost" className="cursor-pointer" onClick={() => setOpen(!open)}>
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>

        {open && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2">
              {VERTICAL_CARD_FIELDS[slug].map((field) => (
                <div key={field}>
                  <span className="text-muted-foreground">{field.replaceAll("_", " ")}:</span>{" "}
                  <span>{display(row[field])}</span>
                </div>
              ))}
            </div>
            {row.description && <p className="text-muted-foreground">{row.description}</p>}

            {row.status === "pending" && (
              <div className="flex gap-2 pt-2 border-t">
                <Button
                  size="sm"
                  className="cursor-pointer"
                  disabled={busy}
                  onClick={() => setPromoteOpen(true)}
                >
                  Promote
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="cursor-pointer"
                  disabled={busy}
                  onClick={handleDiscard}
                >
                  Discard
                </Button>
              </div>
            )}
          </div>
        )}
      </Card>

      <PromoteVerticalDialog
        row={row}
        slug={slug}
        open={promoteOpen}
        onOpenChange={setPromoteOpen}
      />
    </>
  );
}
