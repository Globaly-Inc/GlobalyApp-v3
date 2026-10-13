"use client";

import type { ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { SectionTabs } from "@/components/section-tabs";
import { useAppSelector } from "@/lib/hooks";
import { EmptyState } from "@/components/ui/empty-state";
import { ActivityTab } from "./tabs/activity-tab";
import { BranchesTab } from "./tabs/branches-tab";
import { ContactsTab } from "./tabs/contacts-tab";
import { InstitutionBranchesTab } from "./tabs/institution-branches-tab";
import { InstitutionMembersTab } from "./tabs/institution-members-tab";
import { InstitutionPartnersTab } from "./tabs/institution-partners-tab";
import { InstitutionServicesTab } from "./tabs/institution-services-tab";
import { MembersTab } from "./tabs/members-tab";
import { PartnersTab } from "./tabs/partners-tab";
import { ServicesTab } from "./tabs/services-tab";

const TABS = [
  { value: "branches", label: "Branches" },
  { value: "partners", label: "Partners" },
  { value: "members", label: "Users" },
  { value: "contacts", label: "Contacts" },
  { value: "services", label: "Services" },
  { value: "activity", label: "Activity" },
] as const;

type Tab = (typeof TABS)[number]["value"];

const VALID_TABS: Tab[] = TABS.map((t) => t.value);

function parseTab(raw: string | null): Tab {
  return (VALID_TABS as string[]).includes(raw ?? "") ? (raw as Tab) : "branches";
}

const NOT_AVAILABLE = "Not available for institutions yet.";

export function DetailTabs({
  kind,
  id,
  businessName,
  businessType,
  readOnly = false,
  isPreSeeded = false,
  sidebar,
}: Readonly<{
  kind: "business" | "institution";
  id: number;
  businessName?: string;
  businessType?: string | null;
  readOnly?: boolean;
  isPreSeeded?: boolean;
  /** The side column beside the tab panel (mockup C3: 2/3 main + 1/3 side). */
  sidebar: ReactNode;
}>) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const countries = useAppSelector((state) => state.platformCategories.countries);
  const tab = parseTab(searchParams.get("tab"));
  const setTab = (next: Tab) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", next);
    // replace, not push: a tab switch isn't a page — Back should return to the list, not step through tabs.
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <>
      <SectionTabs options={TABS} value={tab} onChange={setTab} className="mb-0" />
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent>
            {tab === "branches" && (kind === "business" ? (
              <BranchesTab businessId={id} readOnly={readOnly || isPreSeeded} />
            ) : (
              <InstitutionBranchesTab institutionId={id} />
            ))}
            {tab === "partners" && (kind === "business" ? (
              <PartnersTab businessId={id} businessName={businessName} businessType={businessType} readOnly={readOnly} />
            ) : (
              <InstitutionPartnersTab institutionId={id} />
            ))}
            {tab === "members" && (kind === "business" ? (
              <MembersTab businessId={id} readOnly={readOnly} />
            ) : (
              <InstitutionMembersTab institutionId={id} readOnly={readOnly} />
            ))}
            {/* Contacts are a superadmin-only concept (business_contacts/members CRM fields have no
                owner-facing self-service editor) — never gated by claim status like the other
                tabs, since there is no "owner's own edit" for this to defer to. */}
            {tab === "contacts" && <ContactsTab kind={kind} id={id} countries={countries} />}
            {tab === "services" && (kind === "business" ? (
              <ServicesTab businessId={id} readOnly={readOnly || isPreSeeded} />
            ) : (
              <InstitutionServicesTab institutionId={id} readOnly={readOnly} />
            ))}
            {tab === "activity" && (kind === "business" ? (
              <ActivityTab businessId={id} />
            ) : (
              <EmptyState compact icon={Clock} title="No activity yet" description={NOT_AVAILABLE} />
            ))}
          </CardContent>
        </Card>
        <div className="flex flex-col gap-6">{sidebar}</div>
      </div>
    </>
  );
}
