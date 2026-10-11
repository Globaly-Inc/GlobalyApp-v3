"use client";

import { Award, CheckCircle2, Globe, XCircle } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCard, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ModerationStatusBadge } from "./moderation-status-badge";
import { ModeratedRowActions } from "./row-actions-menu";
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
    return <EmptyState icon={Award} title="No accreditations yet." />;
  }

  return (
    <TableCard>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Accreditation</TableHead>
            <TableHead className="hidden lg:table-cell">Scope</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-px"><span className="sr-only">Actions</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => {
            const issuerPending = item.issuing_organization_status === "pending" && item.issuing_organization_id;
            return (
              <TableRow key={item.id}>
                <TableCell primary>
                  <div className="flex min-w-0 items-center gap-3">
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
                    <div className="min-w-0">
                      <span className="block truncate font-medium text-foreground">{item.name}</span>
                      {item.issuing_organization_name && (
                        <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                          <span className="truncate">Issuer: {item.issuing_organization_name}</span>
                          {item.issuing_organization_status && item.issuing_organization_status !== "approved" && (
                            <ModerationStatusBadge status={item.issuing_organization_status} />
                          )}
                        </div>
                      )}
                      {/* Fallback for the Scope column, hidden below lg. */}
                      <div className="mt-1 flex flex-wrap items-center gap-1 lg:hidden">
                        <ScopeBadges item={item} countryById={countryById} />
                      </div>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="hidden whitespace-normal lg:table-cell">
                  <div className="flex max-w-xs flex-wrap items-center gap-1">
                    <ScopeBadges item={item} countryById={countryById} />
                  </div>
                </TableCell>
                <TableCell>
                  <ModerationStatusBadge status={item.status} />
                </TableCell>
                <TableCell>
                  <ModeratedRowActions
                    name={item.name}
                    pending={item.status === "pending"}
                    onReview={(decision) => onReview(item.id, decision)}
                    onEdit={() => onEdit(item)}
                    onDelete={() => onDelete(item)}
                    extraItems={
                      issuerPending ? (
                        <>
                          <DropdownMenuItem onClick={() => onReviewIssuer(item.issuing_organization_id!, "approved")}>
                            <CheckCircle2 className="mr-2 h-4 w-4 text-success" /> Approve issuer
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onReviewIssuer(item.issuing_organization_id!, "rejected")}>
                            <XCircle className="mr-2 h-4 w-4 text-destructive" /> Reject issuer
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                        </>
                      ) : null
                    }
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableCard>
  );
}

/** Where an accreditation applies: global, organisation-only, and/or the countries it's scoped to. */
function ScopeBadges({
  item, countryById,
}: Readonly<{ item: Accreditation; countryById: Map<number, CountryOption> }>) {
  return (
    <>
      {item.is_global && (
        <Badge variant="secondary">
          <Globe data-icon="inline-start" />
          Global
        </Badge>
      )}
      {item.business_id && !item.is_global && <Badge variant="outline">Organisation</Badge>}
      {!item.is_global &&
        item.scope_country_ids.map((id) => {
          const country = countryById.get(id);
          if (!country) return null;
          return (
            <Badge key={id} variant="outline" className="font-normal">
              <span>{flagFromIso2(country.iso2)}</span>
              {country.name}
            </Badge>
          );
        })}
    </>
  );
}
