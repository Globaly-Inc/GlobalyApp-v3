"use client";

// Business descriptions are authored by the business and rendered here as HTML (`prose`), so
// they are an untrusted HTML sink: a business owner storing `<img src=x onerror=...>` would run
// it in the session of whichever platform admin opens their listing. `description` is only
// `z.string().max(5000)` on write, so nothing upstream removes it.
// `isomorphic-dompurify`, not `dompurify`: this is a "use client" component, which Next still
// renders on the SERVER first, and plain dompurify has no DOM there — `sanitize` is not even a
// function, so it throws rather than sanitising.
import DOMPurify from "isomorphic-dompurify";

import { useState } from "react";
import { ExternalLink, Link2, Mail, MessageCircle, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DescriptionItem, DescriptionList } from "@/components/ui/description-list";
import { Switch } from "@/components/ui/switch";
import { EditableNumberField } from "./shared/editable-number-field";
import type { SocialMediaValues } from "./social-media-dialog";

type EnquiryProps = {
  enabled: boolean;
  coinCost: number;
  maxDistributions: number;
  onPatch: (patch: { enquiry_enabled?: boolean; enquiry_coin_cost?: number; enquiry_max_distributions?: number }) => void;
};

const SOCIAL_LINKS: { key: keyof SocialMediaValues; label: string; badgeClass: string }[] = [
  { key: "linkedin_url", label: "LinkedIn", badgeClass: "bg-[#0A66C2]/10 text-[#0A66C2]" },
  { key: "facebook_url", label: "Facebook", badgeClass: "bg-[#1877F2]/10 text-[#1877F2]" },
  { key: "instagram_url", label: "Instagram", badgeClass: "bg-[#E4405F]/10 text-[#E4405F]" },
  { key: "twitter_url", label: "Twitter / X", badgeClass: "bg-foreground/10 text-foreground" },
  { key: "youtube_url", label: "YouTube", badgeClass: "bg-[#FF0000]/10 text-[#FF0000]" },
  { key: "whatsapp_url", label: "WhatsApp", badgeClass: "bg-[#25D366]/10 text-[#25D366]" },
];

export function DetailSidebar({
  description,
  onEditOverview,
  statusLabel,
  statusVariant,
  sourceLabel,
  social,
  onEditSocial,
  enquiry,
  readOnly = false,
}: Readonly<{
  description: string | null;
  onEditOverview: () => void;
  statusLabel: string;
  statusVariant: React.ComponentProps<typeof Badge>["variant"];
  sourceLabel: string;
  social: SocialMediaValues;
  onEditSocial: () => void;
  /** Omit (or pass null) to hide the Enquiry Settings card — e.g. for kinds that don't support it yet. */
  enquiry: EnquiryProps | null;
  /** The owner has claimed this listing — hide the description edit control. */
  readOnly?: boolean;
}>) {
  const [descExpanded, setDescExpanded] = useState(false);

  const editButton = (label: string, onClick: () => void) =>
    !readOnly && (
      <CardAction>
        <Button variant="ghost" size="icon-sm" onClick={onClick} aria-label={label}>
          <Pencil />
        </Button>
      </CardAction>
    );

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <DescriptionList>
            <DescriptionItem label="Status">
              <Badge variant={statusVariant}>{statusLabel}</Badge>
            </DescriptionItem>
            <DescriptionItem label="Source">{sourceLabel}</DescriptionItem>
          </DescriptionList>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Description</CardTitle>
          {editButton("Edit description", onEditOverview)}
        </CardHeader>
        <CardContent>
          {description ? (
            <>
              <div
                className={
                  descExpanded
                    ? "prose prose-sm dark:prose-invert max-w-none text-foreground"
                    : "prose prose-sm dark:prose-invert line-clamp-3 max-w-none text-foreground"
                }
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(description) }}
              />
              <Button variant="link" size="sm" className="mt-1 h-auto px-0" onClick={() => setDescExpanded((v) => !v)}>
                {descExpanded ? "Show less" : "Show more"}
              </Button>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No description yet.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Social media</CardTitle>
          {editButton("Edit social media", onEditSocial)}
        </CardHeader>
        <CardContent>
          {SOCIAL_LINKS.some(({ key }) => social[key]) ? (
            <div className="flex flex-col gap-1">
              {SOCIAL_LINKS.filter(({ key }) => social[key]).map(({ key, label, badgeClass }) => (
                <a
                  key={key}
                  href={social[key]!}
                  target="_blank"
                  rel="noreferrer"
                  className="group -mx-2 flex items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/60"
                >
                  <span className={`flex size-7 shrink-0 items-center justify-center rounded-full ${badgeClass}`}>
                    {key === "whatsapp_url" ? <MessageCircle className="size-3.5" /> : <Link2 className="size-3.5" />}
                  </span>
                  <span className="flex-1 truncate text-sm font-medium text-foreground">{label}</span>
                  <ExternalLink className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
                </a>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No social links yet.</p>
          )}
        </CardContent>
      </Card>

      {enquiry && (
        <Card>
          <CardHeader>
            <CardTitle>Enquiry settings</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="enquiry-enabled" className="flex items-center gap-1.5 text-sm font-medium">
                <Mail className="size-4 text-muted-foreground" /> Enabled
              </label>
              <Switch id="enquiry-enabled" checked={enquiry.enabled} onCheckedChange={(checked) => enquiry.onPatch({ enquiry_enabled: checked })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
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
    </>
  );
}
