"use client";

import { useEffect, useState } from "react";
import { DollarSign, Link2, Loader2, Save, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/combobox";
import { FieldError } from "@/components/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { categoriesApi } from "@/app/admin/platform/categories/apis";
import { geoApi } from "@/app/geo/apis";
import { Textarea } from "@/components/ui/textarea";
import { CURRENCY_OPTIONS, ENABLED_FEE_TYPES, PERIOD_TYPE_OPTIONS, STUDENT_TYPE_OPTIONS } from "../const";
import { buildFeePayloads, emptyFeeInstallment, feeInstallmentsFromFee } from "../utils";
import { CourseLinkPicker } from "./course-link-picker";
import { FeeInstallmentsEditor } from "./fee-installments-editor";
import type { CourseFee, CourseFeeParams } from "../apis/types";
import type { FeeFormInstallment } from "../types";

export function FeeForm({
  jobId,
  fee,
  saving,
  onCancel,
  onSave,
}: Readonly<{
  jobId: string;
  fee?: CourseFee;
  saving: boolean;
  onCancel: () => void;
  /** One entry normally; two — domestic then international — when the split toggle is on. */
  onSave: (values: CourseFeeParams[]) => void;
}>) {
  const [studentType, setStudentType] = useState(fee?.student_type ?? "both");
  const [periodType, setPeriodType] = useState(fee?.period_type ?? "Per Year");
  const [currency, setCurrency] = useState(fee?.currency ?? "AUD");
  const [name, setName] = useState(fee?.name ?? "");
  const [description, setDescription] = useState(fee?.description ?? "");
  const [installments, setInstallments] = useState<FeeFormInstallment[]>(() => feeInstallmentsFromFee(fee));
  // Offered on add only: splitting an EXISTING row would have to pick which of the two fees on
  // screen is the one being edited, and the rows carry no pairing key to pick with.
  const [split, setSplit] = useState(false);
  const [intlInstallments, setIntlInstallments] = useState<FeeFormInstallment[]>(() => [emptyFeeInstallment(0)]);
  const [saveForReuse, setSaveForReuse] = useState(fee?.save_for_reuse ?? false);
  const [courses, setCourses] = useState<{ id: string; name: string | null }[]>([]);
  const [feeTypes, setFeeTypes] = useState<{ value: string; label: string }[]>([]);
  const [currencyOptions, setCurrencyOptions] = useState(CURRENCY_OPTIONS);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    // A fee being edited keeps whatever type its lines already carry, even a disabled one —
    // dropping it from the options would blank that line and save the fee back without it.
    const inUse = feeInstallmentsFromFee(fee).flatMap((i) => i.lines.map((l) => l.fee_type));
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
        setCurrencyOptions(
          [...byCode].sort(([a], [b]) => a.localeCompare(b)).map(([value, label]) => ({ value, label })),
        );
      })
      .catch(() => setCurrencyOptions(CURRENCY_OPTIONS));
  }, []);

  const clearError = (key: string) => {
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: "" }));
  };

  const submit = () => {
    const { errors: errs, values } = buildFeePayloads(
      { periodType, currency, name, description, saveForReuse },
      split
        ? [
            { studentType: "domestic", installments, errorKey: "installments" },
            { studentType: "international", installments: intlInstallments, errorKey: "intlInstallments" },
          ]
        : [{ studentType, installments, errorKey: "installments" }],
    );

    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setErrors({});
    // Junction write, create-only — an update goes through save-and-learn, which would try to
    // patch it as a column.
    onSave(fee ? values : values.map((v) => ({ ...v, course_ids: courses.map((c) => c.id) })));
  };

  return (
    <Card className="border-primary/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <DollarSign className="h-4 w-4 text-primary" />
          {fee ? "Edit Course Fee" : "Add Course Fee"}
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
                    onCheckedChange={() => {
                      setStudentType(option.value);
                      clearError("studentType");
                    }}
                  />
                  {option.label}
                </label>
              ))}
            </div>
            <FieldError message={errors.studentType} />
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="fee-name">Fee Name</Label>
          <Input
            id="fee-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Semester Fee, Tuition Fee, Application Fee"
          />
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
            <Combobox
              id="fee-period"
              options={PERIOD_TYPE_OPTIONS}
              value={periodType}
              onChange={(v) => {
                setPeriodType(v);
                clearError("periodType");
              }}
              placeholder="Select period"
              aria-invalid={Boolean(errors.periodType)}
              creatable
            />
            <FieldError message={errors.periodType} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fee-currency">
              Currency <span className="text-destructive">*</span>
            </Label>
            <Combobox
              id="fee-currency"
              options={currencyOptions}
              value={currency}
              onChange={(v) => {
                setCurrency(v);
                clearError("currency");
              }}
              placeholder="Select currency"
              aria-invalid={Boolean(errors.currency)}
              creatable
            />
            <FieldError message={errors.currency} />
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

        {/* Linking here saves the round trip of creating the fee, finding the course and
            linking it there. Editing keeps using the card's own link editor. */}
        {!fee && (
          <div className="flex flex-col gap-1.5">
            <Label>Link to Courses</Label>
            {courses.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {courses.map((course) => (
                  <Badge key={course.id} className="gap-1 bg-primary/10 text-xs text-primary">
                    <Link2 className="h-3 w-3" />
                    {course.name ?? "Unnamed course"}
                    <button
                      type="button"
                      className="cursor-pointer"
                      title="Remove course"
                      onClick={() => setCourses((prev) => prev.filter((c) => c.id !== course.id))}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            <CourseLinkPicker
              jobId={jobId}
              excludeIds={courses.map((c) => c.id)}
              onSelect={(id, courseName) => setCourses((prev) => [...prev, { id, name: courseName }])}
            />
          </div>
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
