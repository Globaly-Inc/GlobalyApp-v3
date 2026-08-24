import { Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Combobox } from "@/components/combobox";
import { PROGRAM_STATUS_BADGE_VARIANT, PROGRAM_STATUS_LABEL } from "../const";
import type { Program, ProgramStatus } from "../apis/types";

const STATUS_OPTIONS = (["draft", "active", "paused", "closed"] as ProgramStatus[]).map((s) => ({
  value: s,
  label: PROGRAM_STATUS_LABEL[s],
}));

export function ProgramCard({
  program,
  onStatusChange,
  onViewApplications,
}: {
  program: Program;
  onStatusChange: (status: ProgramStatus) => void;
  onViewApplications: () => void;
}) {
  const commissionLabel =
    program.commission_type === "flat"
      ? `${program.currency} ${program.commission_value} flat`
      : `${program.commission_value}% of order value`;

  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold">{program.name}</h3>
          {program.description && <p className="text-sm text-muted-foreground">{program.description}</p>}
        </div>
        <Badge variant={PROGRAM_STATUS_BADGE_VARIANT[program.status]}>{PROGRAM_STATUS_LABEL[program.status]}</Badge>
      </div>

      <p className="text-sm">
        <span className="font-medium">Commission:</span> {commissionLabel}
      </p>

      <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
        <Combobox
          className="w-40"
          options={STATUS_OPTIONS}
          value={program.status}
          onChange={(v) => onStatusChange(v as ProgramStatus)}
          placeholder="Status"
        />
        <Button variant="outline" size="sm" onClick={onViewApplications}>
          <Users className="mr-2 h-4 w-4" />
          Applications
        </Button>
      </div>
    </Card>
  );
}
