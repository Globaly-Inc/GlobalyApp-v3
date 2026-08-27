"use client";

import { useState } from "react";
import { Mail, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { EditableNumberField } from "./shared/editable-number-field";

type EnquiryProps = {
  enabled: boolean;
  coinCost: number;
  maxDistributions: number;
  onPatch: (patch: { enquiry_enabled?: boolean; enquiry_coin_cost?: number; enquiry_max_distributions?: number }) => void;
};

export function DetailSidebar({
  description,
  onEditOverview,
  statusLabel,
  statusColor,
  sourceLabel,
  enquiry,
  readOnly = false,
}: Readonly<{
  description: string | null;
  onEditOverview: () => void;
  statusLabel: string;
  statusColor: string;
  sourceLabel: string;
  /** Omit (or pass null) to hide the Enquiry Settings card — e.g. for kinds that don't support it yet. */
  enquiry: EnquiryProps | null;
  /** The owner has claimed this listing — hide the description edit control. */
  readOnly?: boolean;
}>) {
  const [descExpanded, setDescExpanded] = useState(false);

  return (
    <div className="space-y-4 lg:col-span-1">
      <Card>
        <CardContent>
          <h2 className="mb-3 text-sm font-semibold">Overview</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-muted-foreground">Status</p>
              <Badge className={statusColor}>{statusLabel}</Badge>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Source</p>
              <p className="text-sm font-medium">{sourceLabel}</p>
            </div>
          </div>

          <div className="mt-4 flex items-start justify-between gap-2">
            <p className="text-xs text-muted-foreground">Description</p>
            {!readOnly && (
              <Button variant="ghost" size="icon-sm" onClick={onEditOverview} aria-label="Edit description">
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          {description ? (
            <>
              <div
                className={
                  descExpanded
                    ? "prose prose-sm dark:prose-invert max-w-none text-foreground"
                    : "prose prose-sm dark:prose-invert line-clamp-3 max-w-none text-foreground"
                }
                dangerouslySetInnerHTML={{ __html: description }}
              />
              <button type="button" className="mt-1 text-xs font-medium text-primary" onClick={() => setDescExpanded((v) => !v)}>
                {descExpanded ? "Show less" : "Show more"}
              </button>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No description yet.</p>
          )}
        </CardContent>
      </Card>

      {enquiry && (
        <Card>
          <CardContent>
            <h2 className="mb-3 text-sm font-semibold">Enquiry Settings</h2>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-sm">
                <Mail className="h-3.5 w-3.5 text-muted-foreground" /> Enabled
              </span>
              <Switch checked={enquiry.enabled} onCheckedChange={(checked) => enquiry.onPatch({ enquiry_enabled: checked })} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <EditableNumberField
                label="Coin Cost per Unlock"
                value={enquiry.coinCost}
                onSave={async (next) => enquiry.onPatch({ enquiry_coin_cost: next })}
              />
              <EditableNumberField
                label="Max Distributions"
                value={enquiry.maxDistributions}
                onSave={async (next) => enquiry.onPatch({ enquiry_max_distributions: next })}
              />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
