"use client";

import { useEffect, useState } from "react";
import { DollarSign, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { categoriesApi } from "@/app/admin/platform/categories/apis";
import { geoApi } from "@/app/geo/apis";
import { CURRENCY_OPTIONS, ENABLED_FEE_TYPES, PERIOD_TYPE_OPTIONS, STUDENT_TYPE_OPTIONS } from "@/app/admin/data/all-extractions/const";
import { emptyFeeInstallment, sumFeeInstallments } from "@/app/admin/data/all-extractions/utils";
import { FeeInstallmentsEditor } from "@/app/admin/data/all-extractions/components/fee-installments-editor";
import type { FeeFormInstallment } from "@/app/admin/data/all-extractions/types";
import type { ServiceFee, ServiceFeeInput } from "../../apis/types";

// Same-to-same reuse of the data-extraction "Add Course Fee" form (fee-form.tsx) — same Fee Name,
// Description, split domestic/international toggle, installments editor, and dynamic currency
// list — trimmed only of "Link to Courses" (a service fee already belongs to one service).
function toFormInstallments(fee?: ServiceFee): FeeFormInstallment[] {
  if (fee?.installments.length) {
    return fee.installments.map((i) => ({ label: i.label, lines: i.lines.map((l) => ({ fee_type: l.fee_type, amount: String(l.amount) })) }));
  }
  return [emptyFeeInstallment(0)];
}

export function ServiceFeeForm({
  fee,
  saving,
  isCourse,
  onCancel,
  onSave,
}: Readonly<{
  fee?: ServiceFee;
  saving: boolean;
  isCourse: boolean;
  onCancel: () => void;
  /** One entry normally; two — domestic then international — when the split toggle is on. */
  onSave: (values: ServiceFeeInput[]) => void;
}>) {
  const feeLabel = isCourse ? "Course Fee" : "Service Fee";
  const [studentType, setStudentType] = useState<ServiceFeeInput["student_type"]>(fee?.student_type ?? "both");
  const [periodType, setPeriodType] = useState(fee?.period_type ?? "Per Year");
  const [currency, setCurrency] = useState(fee?.currency ?? "AUD");
  const [name, setName] = useState(fee?.name ?? "");
  const [description, setDescription] = useState("");
  const [installments, setInstallments] = useState<FeeFormInstallment[]>(() => toFormInstallments(fee));
  const [split, setSplit] = useState(false);
  const [intlInstallments, setIntlInstallments] = useState<FeeFormInstallment[]>(() => [emptyFeeInstallment(0)]);
  const [saveForReuse, setSaveForReuse] = useState(false);
  const [feeTypes, setFeeTypes] = useState<{ value: string; label: string }[]>([]);
  const [currencyOptions, setCurrencyOptions] = useState(CURRENCY_OPTIONS);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const inUse = toFormInstallments(fee).flatMap((i) => i.lines.map((l) => l.fee_type));
    categoriesApi.getFeeTypes({ limit: 100 })
      .then((res) => setFeeTypes(
        res.data
          .filter((f) => ENABLED_FEE_TYPES.includes(f.name) || inUse.includes(f.name))
          .map((f) => ({ value: f.name, label: f.name })),
      ))
      .catch(() => setFeeTypes([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the fee's own types, read once on mount
  }, []);

  // Currencies come from the countries table — CURRENCY_OPTIONS is only the offline fallback.
  useEffect(() => {
    geoApi.getCountries()
      .then((countries) => {
        const byCode = new Map(
          countries
            .filter((c) => c.currency)
            .map((c) => [c.currency!, `${c.currency}${c.currencySymbol ? ` (${c.currencySymbol})` : ""}`]),
        );
        if (byCode.size === 0) return;
        setCurrencyOptions([...byCode].sort(([a], [b]) => a.localeCompare(b)).map(([value, label]) => ({ value, label })));
      })
      .catch(() => setCurrencyOptions(CURRENCY_OPTIONS));
  }, []);

  const clearError = (key: string) => {
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: "" }));
  };

  const toPayload = (audience: ServiceFeeInput["student_type"], list: FeeFormInstallment[]): ServiceFeeInput => {
    const cleaned = list
      .map((i) => ({ label: i.label, lines: i.lines.filter((l) => l.fee_type && Number(l.amount) > 0) }))
      .filter((i) => i.lines.length > 0);
    return {
      name: name || null,
      student_type: audience,
      period_type: periodType,
      currency,
      total_amount: sumFeeInstallments(list),
      installments: cleaned.map((i) => ({ label: i.label, lines: i.lines.map((l) => ({ fee_type: l.fee_type, amount: Number(l.amount) })) })),
    };
  };

  const submit = () => {
    const errs: Record<string, string> = {};
    const hasLines = (list: FeeFormInstallment[]) => list.some((i) => i.lines.some((l) => l.fee_type && Number(l.amount) > 0));
    if (!hasLines(installments)) errs.installments = "Add at least one fee type with an amount";
    if (split && !hasLines(intlInstallments)) errs.intlInstallments = "Add at least one fee type with an amount";
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setErrors({});
    onSave(
      split
        ? [toPayload("domestic", installments), toPayload("international", intlInstallments)]
        : [toPayload(studentType, installments)],
    );
  };

  return (
    <Card className="border-primary/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <DollarSign className="h-4 w-4 text-primary" />
          {fee ? `Edit ${feeLabel}` : `Add ${feeLabel}`}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex max-h-[70vh] flex-col gap-5 overflow-y-auto">
        {!fee && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
            <div>
              <span className="text-sm">Separate domestic &amp; international amounts</span>
              <p className="text-xs text-muted-foreground">Fill both below and save once — adds one fee for each.</p>
            </div>
            <Switch checked={split} onCheckedChange={setSplit} />
          </div>
        )}

        {!split && (
          <div className="flex flex-col gap-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Fee structure <span className="text-destructive">*</span>
            </Label>
            <div className="flex flex-wrap items-center gap-6">
              {STUDENT_TYPE_OPTIONS.map((option) => (
                <label key={option.value} className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    checked={studentType === option.value}
                    onCheckedChange={() => setStudentType(option.value as ServiceFeeInput["student_type"])}
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="fee-name">Fee Name</Label>
          <Input id="fee-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Semester Fee, Tuition Fee, Application Fee" />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="fee-description">Description</Label>
          <Textarea
            id="fee-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="What the page says about this fee — per-credit breakdown, range, what it covers"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fee-period">
              Period Type <span className="text-destructive">*</span>
            </Label>
            <Combobox id="fee-period" options={PERIOD_TYPE_OPTIONS} value={periodType} onChange={setPeriodType} placeholder="Select period" creatable />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fee-currency">
              Currency <span className="text-destructive">*</span>
            </Label>
            <Combobox id="fee-currency" options={currencyOptions} value={currency} onChange={setCurrency} placeholder="Select currency" creatable />
          </div>
        </div>

        <FeeInstallmentsEditor
          heading={split ? "Domestic Students" : undefined}
          installments={installments}
          setInstallments={setInstallments}
          currency={currency}
          feeTypes={feeTypes}
          error={errors.installments}
          onDirty={() => clearError("installments")}
        />

        {split && (
          <FeeInstallmentsEditor
            heading="International Students"
            installments={intlInstallments}
            setInstallments={setIntlInstallments}
            currency={currency}
            feeTypes={feeTypes}
            error={errors.intlInstallments}
            onDirty={() => clearError("intlInstallments")}
          />
        )}

        <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
          <span className="text-sm">Save this for future uses</span>
          <Switch checked={saveForReuse} onCheckedChange={setSaveForReuse} />
        </div>
      </CardContent>
      <CardFooter className="justify-end gap-2">
        <Button variant="outline" className="cursor-pointer" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button className="gap-1.5 cursor-pointer" onClick={submit} disabled={saving}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          {split ? "Save Both Fees" : "Save Fee"}
        </Button>
      </CardFooter>
    </Card>
  );
}
