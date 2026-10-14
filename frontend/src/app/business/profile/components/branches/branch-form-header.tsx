"use client";

import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export function BranchFormHeader({
  isEdit,
  branchName,
  parentName,
  onBack,
}: Readonly<{ isEdit: boolean; branchName?: string; parentName?: string; onBack: () => void }>) {
  return (
    <>
      <Button variant="ghost" size="sm" className="group/back mb-3 -ml-2" onClick={onBack}>
        <ArrowLeft className="mr-1.5 h-4 w-4 transition-transform group-hover/back:-translate-x-0.5" /> Back to branches
      </Button>
      <div className="mb-5">
        <h2 className="text-2xl font-bold text-balance">{isEdit ? "Edit branch" : "Create new branch"}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {isEdit ? (
            <>Update <strong className="text-foreground">{branchName}</strong>&apos;s details.</>
          ) : (
            <>Add a new branch location under <strong className="text-foreground">{parentName ?? "this business"}</strong>.</>
          )}
        </p>
      </div>
    </>
  );
}
