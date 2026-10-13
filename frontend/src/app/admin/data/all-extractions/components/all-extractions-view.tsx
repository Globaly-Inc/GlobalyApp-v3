"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus, ScanSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
import { SectionTabs } from "@/components/section-tabs";
import { JobsList } from "./jobs-list";
import { NewExtractionDialog } from "./new-extraction-dialog";
import { MaraAgentsView } from "../../mara-agents/components/mara-agents-view";
import { VisasView } from "../../visas/components/visas-view";

type ListTab = "all" | "mara" | "visas";

// MARA Agents and Visas moved here from their own top-level nav items — same page,
// own Redux slice/API each, rendered inline so the tab bar stays put across sub-tabs.
const TABS: { value: ListTab; label: string }[] = [
  { value: "all", label: "All" },
  { value: "mara", label: "MARA Agents" },
  { value: "visas", label: "Visas" },
];

function parseTab(raw: string | null): ListTab {
  return TABS.some((t) => t.value === raw) ? (raw as ListTab) : "all";
}

export function AllExtractionsView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [showNewForm, setShowNewForm] = useState(false);

  const active = parseTab(searchParams.get("tab"));

  const setTab = (tab: ListTab) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <PageBody>
      <PageHeader
        title={<><ScanSearch /> All Extractions</>}
        subtitle="Every extraction job — ongoing, completed, failed, declined. Nothing is hidden."
      >
        {active === "all" && (
          <Button className="gap-2" onClick={() => setShowNewForm(true)}>
            <Plus className="h-4 w-4" />
            New Extraction
          </Button>
        )}
      </PageHeader>

      <SectionTabs options={TABS} value={active} onChange={setTab} />

      <NewExtractionDialog open={showNewForm} onOpenChange={setShowNewForm} />
      {active === "all" && <JobsList mode="all" onNewExtraction={() => setShowNewForm(true)} />}
      {active === "mara" && <MaraAgentsView />}
      {active === "visas" && <VisasView />}
    </PageBody>
  );
}
