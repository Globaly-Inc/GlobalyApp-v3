"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Clock, Contact } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { AdminSegmentedTabs } from "@/app/admin/components/admin-segmented-tabs";
import { EmptyTabPlaceholder } from "./shared/empty-tab-placeholder";
import { ActivityTab } from "./tabs/activity-tab";
import { BranchesTab } from "./tabs/branches-tab";
import { ContactsTab } from "./tabs/contacts-tab";
import { InstitutionBranchesTab } from "./tabs/institution-branches-tab";
import { InstitutionCoursesTab } from "./tabs/institution-courses-tab";
import { InstitutionMembersTab } from "./tabs/institution-members-tab";
import { InstitutionPartnersTab } from "./tabs/institution-partners-tab";
import { MembersTab } from "./tabs/members-tab";
import { PartnersTab } from "./tabs/partners-tab";
import { ServicesTab } from "./tabs/services-tab";

const TABS = [
  { value: "branches", label: "Branches" },
  { value: "partners", label: "Partners" },
  { value: "members", label: "Members" },
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
}: Readonly<{ kind: "business" | "institution"; id: number; businessName?: string }>) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = parseTab(searchParams.get("tab"));
  const setTab = (next: Tab) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", next);
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="lg:col-span-2">
      <AdminSegmentedTabs options={TABS} value={tab} onChange={setTab} />
      <Card>
        <CardContent>
          {tab === "branches" && (kind === "business" ? (
            <BranchesTab businessId={id} />
          ) : (
            <InstitutionBranchesTab institutionId={id} />
          ))}
          {tab === "partners" && (kind === "business" ? (
            <PartnersTab businessId={id} businessName={businessName} />
          ) : (
            <InstitutionPartnersTab institutionId={id} />
          ))}
          {tab === "members" && (kind === "business" ? <MembersTab businessId={id} /> : <InstitutionMembersTab institutionId={id} />)}
          {tab === "contacts" && (kind === "business" ? (
            <ContactsTab businessId={id} />
          ) : (
            <EmptyTabPlaceholder icon={Contact} title="No contacts yet" subtitle={NOT_AVAILABLE} />
          ))}
          {tab === "services" && (kind === "business" ? <ServicesTab businessId={id} /> : <InstitutionCoursesTab institutionId={id} />)}
          {tab === "activity" && (kind === "business" ? (
            <ActivityTab businessId={id} />
          ) : (
            <EmptyTabPlaceholder icon={Clock} title="No activity yet" subtitle={NOT_AVAILABLE} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
