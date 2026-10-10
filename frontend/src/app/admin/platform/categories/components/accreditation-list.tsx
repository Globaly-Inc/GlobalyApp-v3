"use client";

import { Award, CheckCircle2, Globe, Pencil, Trash2, XCircle } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ModerationStatusBadge } from "./moderation-status-badge";
import { flagFromIso2 } from "../utils";
import type { Accreditation, CountryOption, ModerationStatus } from "../apis/types";

export function AccreditationList({
  items,
  countries,
  onReview,
  onReviewIssuer,
  onEdit,
  onDelete,
}: Readonly<{
  items: Accreditation[];
  countries: CountryOption[];
  onReview: (id: number, decision: ModerationStatus) => void;
  /** Issuers are reviewed separately — approving an accreditation never approves its issuer. */
  onReviewIssuer: (issuerId: number, decision: ModerationStatus) => void;
  onEdit: (item: Accreditation) => void;
  onDelete: (item: Accreditation) => void;
}>) {
  const countryById = new Map(countries.map((c) => [c.id, c]));

  if (items.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No accreditations yet.</p>;
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <Card key={item.id} size="sm">
          <CardContent>
            <div className="flex items-center gap-3">
              <Avatar className="size-8 shrink-0 rounded-lg ring-1 ring-foreground/10">
                {item.issuing_organization_logo_url && (
                  <AvatarImage
                    src={item.issuing_organization_logo_url}
                    alt={item.issuing_organization_name ?? ""}
                    className="object-contain p-0.5"
                  />
                )}
                <AvatarFallback className="rounded-lg bg-primary/10 text-primary">
                  <Award className="size-4" />
                </AvatarFallback>
              </Avatar>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium">{item.name}</p>
                  <ModerationStatusBadge status={item.status} />
                  {item.is_global && (
                    <Badge variant="secondary">
                      <Globe data-icon="inline-start" />
                      Global
                    </Badge>
                  )}
                  {item.business_id && !item.is_global && <Badge variant="outline">Organisation</Badge>}
                </div>
                {item.issuing_organization_name && (
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <span>Issuer: {item.issuing_organization_name}</span>
                    {item.issuing_organization_status && item.issuing_organization_status !== "approved" && (
                      <ModerationStatusBadge status={item.issuing_organization_status} />
                    )}
                    {item.issuing_organization_status === "pending" && item.issuing_organization_id && (
                      <>
                        <Button
                          variant="ghost"
                          size="xs"
                          aria-label={`Approve issuer ${item.issuing_organization_name}`}
                          onClick={() => onReviewIssuer(item.issuing_organization_id!, "approved")}
                        >
                          <CheckCircle2 className="text-emerald-600" /> Approve issuer
                        </Button>
                        <Button
                          variant="ghost"
                          size="xs"
                          aria-label={`Reject issuer ${item.issuing_organization_name}`}
                          onClick={() => onReviewIssuer(item.issuing_organization_id!, "rejected")}
                        >
                          <XCircle className="text-destructive" /> Reject issuer
                        </Button>
                      </>
                    )}
                  </div>
                )}
                {!item.is_global && item.scope_country_ids.length > 0 && (
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    {item.scope_country_ids.map((id) => {
                      const country = countryById.get(id);
                      if (!country) return null;
                      return (
                        <Badge key={id} variant="outline" className="font-normal">
                          <span>{flagFromIso2(country.iso2)}</span>
                          {country.name}
                        </Badge>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-1">
                {item.status === "pending" && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Approve ${item.name}`}
                      onClick={() => onReview(item.id, "approved")}
                    >
                      <CheckCircle2 className="text-emerald-600" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Reject ${item.name}`}
                      onClick={() => onReview(item.id, "rejected")}
                    >
                      <XCircle className="text-destructive" />
                    </Button>
                  </>
                )}
                <Button variant="ghost" size="icon-sm" aria-label={`Edit ${item.name}`} onClick={() => onEdit(item)}>
                  <Pencil />
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label={`Delete ${item.name}`} onClick={() => onDelete(item)}>
                  <Trash2 className="text-destructive" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
