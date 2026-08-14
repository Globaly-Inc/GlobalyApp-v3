"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { AdminSegmentedTabs } from "../../../components/admin-segmented-tabs";
import { categoriesApi } from "../apis";
import { ADD_LABEL, CATEGORY_TABS, ROUTE_SEGMENT, TAB_DESCRIPTION } from "../const";
import {
  fetchAccreditations, fetchBusinessCategories, fetchCatalog, fetchFeeTypes, fetchIssuingOrganizations,
  fetchLookup, fetchOtherServiceCategories, fetchServiceCategories, removeAccreditation, removeFeeType, reviewAccreditation, reviewFeeType,
  saveAccreditation, saveCategory, saveFeeType, saveLookup,
  toggleCategory, toggleLookup,
} from "../store/categories-slice";
import type { CategoryKind } from "../store/categories-slice";
import type {
  Accreditation, AccreditationInput, Category, CategoryInput, FeeType, FeeTypeInput,
  Lookup, LookupInput, LookupKind, ModerationStatus,
} from "../apis/types";
import type { CategoryTab } from "../types";
import { AccreditationDialog } from "./accreditation-dialog";
import { AccreditationList } from "./accreditation-list";
import { CategoryDialog } from "./category-dialog";
import { CategoryList } from "./category-list";
import { ConfirmDeleteDialog } from "./confirm-delete-dialog";
import { FeeTypeDialog } from "./fee-type-dialog";
import { FeeTypeList } from "./fee-type-list";
import { LookupDialog } from "./lookup-dialog";
import { LookupList } from "./lookup-list";

const LOOKUP_KIND: Record<"degree_levels" | "areas_of_study", LookupKind> = {
  degree_levels: "degree-levels",
  areas_of_study: "areas-of-study",
};

const LOOKUP_TITLE: Record<"degree_levels" | "areas_of_study", string> = {
  degree_levels: "degree level",
  areas_of_study: "area of study",
};

type Deleting = { kind: "fee_type" | "accreditation"; id: number; name: string };

export function CategoriesView() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const catalog = useAppSelector((state) => state.platformCategories);
  const [tab, setTab] = useState<CategoryTab>("business");
  const [saving, setSaving] = useState(false);

  const [categoryDialog, setCategoryDialog] = useState<{ open: boolean; editing: Category | null }>({ open: false, editing: null });
  const [lookupDialog, setLookupDialog] = useState<{ open: boolean; editing: Lookup | null }>({ open: false, editing: null });
  const [feeTypeDialog, setFeeTypeDialog] = useState<{ open: boolean; editing: FeeType | null }>({ open: false, editing: null });
  const [accreditationDialog, setAccreditationDialog] = useState<{ open: boolean; editing: Accreditation | null }>({ open: false, editing: null });
  const [deleting, setDeleting] = useState<Deleting | null>(null);
  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    dispatch(fetchCatalog());
  }, [dispatch]);

  const run = async (action: Promise<{ meta: { requestStatus: string } }>, message: string) => {
    setSaving(true);
    const result = await action;
    setSaving(false);
    if (result.meta.requestStatus === "rejected") {
      toast.error("Something went wrong", { description: "Please try again." });
      return false;
    }
    toast.success(message);
    return true;
  };

  const isCategoryTab = tab === "business" || tab === "service" || tab === "other_service";
  const categoryKind: CategoryKind = isCategoryTab ? tab : "service";
  const categoryList =
    tab === "business"
      ? catalog.businessCategories
      : tab === "other_service"
        ? catalog.otherServiceCategories
        : catalog.serviceCategories;
  const categories = categoryList.data;

  /**
   * The personal list is not part of fetchCatalog — that thunk maps its results by index, and threading a
   * ninth call through it is a worse trade than one fetch when the tab is opened. The list is small and the
   * tab is rarely the first thing an admin lands on.
   */
  const handleTabChange = (next: CategoryTab) => {
    setTab(next);
    if (next === "other_service") dispatch(fetchOtherServiceCategories({}));
  };
  const lookupTab = tab === "degree_levels" || tab === "areas_of_study" ? tab : null;
  const lookupList = lookupTab === "degree_levels" ? catalog.degreeLevels : catalog.areasOfStudy;
  const lookups = lookupList.data;

  const handlePageChange = (page: number) => {
    if (tab === "business") dispatch(fetchBusinessCategories({ page }));
    else if (tab === "service") dispatch(fetchServiceCategories({ page }));
    else if (tab === "other_service") dispatch(fetchOtherServiceCategories({ page }));
    else if (lookupTab) dispatch(fetchLookup({ kind: LOOKUP_KIND[lookupTab], page }));
    else if (tab === "fee_types") dispatch(fetchFeeTypes({ page }));
    else if (tab === "accreditations") dispatch(fetchAccreditations({ page }));
  };

  const activePagination = isCategoryTab
    ? categoryList
    : lookupTab
      ? lookupList
      : tab === "fee_types"
        ? catalog.feeTypes
        : catalog.accreditations;

  const handleAdd = () => {
    if (isCategoryTab) setCategoryDialog({ open: true, editing: null });
    else if (lookupTab) setLookupDialog({ open: true, editing: null });
    else if (tab === "fee_types") setFeeTypeDialog({ open: true, editing: null });
    else if (tab === "accreditations") setAccreditationDialog({ open: true, editing: null });
  };

  const handleSaveCategory = (input: CategoryInput) =>
    run(
      dispatch(saveCategory({ kind: categoryKind, id: categoryDialog.editing?.id ?? null, input })),
      categoryDialog.editing ? "Category updated" : "Category created",
    );

  const handleSaveLookup = (input: LookupInput) =>
    run(
      dispatch(saveLookup({ kind: LOOKUP_KIND[lookupTab!], id: lookupDialog.editing?.id ?? null, input })),
      lookupDialog.editing ? "Item updated" : "Item created",
    );

  const handleSaveFeeType = (input: FeeTypeInput) =>
    run(
      dispatch(saveFeeType({ id: feeTypeDialog.editing?.id ?? null, input })),
      feeTypeDialog.editing ? "Fee type updated" : "Fee type created",
    );

  const handleSaveAccreditation = (input: AccreditationInput) =>
    run(
      dispatch(saveAccreditation({ id: accreditationDialog.editing?.id ?? null, input })),
      accreditationDialog.editing ? "Accreditation updated" : "Accreditation created",
    );

  const handleReview = (kind: Deleting["kind"], id: number, decision: ModerationStatus) => {
    const thunk = kind === "fee_type" ? reviewFeeType : reviewAccreditation;
    void run(dispatch(thunk({ id, decision })), decision === "approved" ? "Approved" : "Rejected");
  };

  const handleConfirmDelete = async () => {
    if (!deleting) return;
    const thunk = deleting.kind === "fee_type" ? removeFeeType : removeAccreditation;
    const ok = await run(dispatch(thunk(deleting.id)), "Deleted");
    if (ok) setDeleting(null);
  };

  const handleCreateOrganization = async (name: string) => {
    const org = await categoriesApi.createIssuingOrganization(name);
    await dispatch(fetchIssuingOrganizations());
    return org;
  };

  const addLabel = ADD_LABEL[tab];

  let tabContent: React.ReactNode;
  if (catalog.status === "loading") {
    tabContent = (
      <div className="flex justify-center py-12">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  } else if (catalog.status === "failed") {
    tabContent = <p className="py-12 text-center text-sm text-destructive">{catalog.error}</p>;
  } else {
    tabContent = (
      <>
        {isCategoryTab && (
          <CategoryList
            categories={categories}
            kind={categoryKind}
            onToggle={(id, is_active) =>
              void run(dispatch(toggleCategory({ kind: categoryKind, id, is_active })), "Category updated")
            }
            onEdit={(editing) => router.push(`/admin/platform/categories/${ROUTE_SEGMENT[categoryKind]}/${editing.id}`)}
          />
        )}

        {lookupTab && (
          <LookupList
            items={lookups}
            kind={LOOKUP_KIND[lookupTab]}
            onToggle={(id, is_active) =>
              void run(dispatch(toggleLookup({ kind: LOOKUP_KIND[lookupTab], id, is_active })), "Item updated")
            }
            onEdit={(editing) => setLookupDialog({ open: true, editing })}
          />
        )}

        {tab === "fee_types" && (
          <FeeTypeList
            items={catalog.feeTypes.data}
            onReview={(id, decision) => handleReview("fee_type", id, decision)}
            onEdit={(editing) => setFeeTypeDialog({ open: true, editing })}
            onDelete={(item) => setDeleting({ kind: "fee_type", id: item.id, name: item.name })}
          />
        )}

        {tab === "accreditations" && (
          <AccreditationList
            items={catalog.accreditations.data}
            countries={catalog.countries}
            onReview={(id, decision) => handleReview("accreditation", id, decision)}
            onEdit={(editing) => setAccreditationDialog({ open: true, editing })}
            onDelete={(item) => setDeleting({ kind: "accreditation", id: item.id, name: item.name })}
          />
        )}
      </>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Categories</h1>
          <p className="mt-1 text-muted-foreground">
            Manage business types, service categories, and academic lookups.
          </p>
        </div>
        {addLabel && (
          <Button className="h-10 cursor-pointer" onClick={handleAdd}>
            <Plus data-icon="inline-start" />
            {addLabel}
          </Button>
        )}
      </div>

      <AdminSegmentedTabs options={CATEGORY_TABS} value={tab} onChange={handleTabChange} />

      {TAB_DESCRIPTION[tab] && (
        <p className="mt-3 max-w-3xl text-sm text-muted-foreground">{TAB_DESCRIPTION[tab]}</p>
      )}

      {tabContent}

      {catalog.status === "idle" && (
        <Pagination
          page={activePagination.page}
          limit={activePagination.limit}
          total={activePagination.total}
          onPageChange={handlePageChange}
        />
      )}

      {isCategoryTab && (
        <CategoryDialog
          open={categoryDialog.open}
          onOpenChange={(open) => setCategoryDialog((s) => ({ ...s, open }))}
          kind={categoryKind}
          editing={categoryDialog.editing}
          nextSortOrder={categoryList.total}
          onSave={handleSaveCategory}
          saving={saving}
        />
      )}

      {lookupTab && (
        <LookupDialog
          open={lookupDialog.open}
          onOpenChange={(open) => setLookupDialog((s) => ({ ...s, open }))}
          title={LOOKUP_TITLE[lookupTab]}
          editing={lookupDialog.editing}
          nextSortOrder={lookupList.total}
          onSave={handleSaveLookup}
          saving={saving}
        />
      )}

      <FeeTypeDialog
        open={feeTypeDialog.open}
        onOpenChange={(open) => setFeeTypeDialog((s) => ({ ...s, open }))}
        editing={feeTypeDialog.editing}
        nextSortOrder={catalog.feeTypes.total}
        onSave={handleSaveFeeType}
        saving={saving}
      />

      <AccreditationDialog
        open={accreditationDialog.open}
        onOpenChange={(open) => setAccreditationDialog((s) => ({ ...s, open }))}
        editing={accreditationDialog.editing}
        nextSortOrder={catalog.accreditations.total}
        organizations={catalog.issuingOrganizations}
        countries={catalog.countries}
        onCreateOrganization={handleCreateOrganization}
        onSave={handleSaveAccreditation}
        saving={saving}
      />

      <ConfirmDeleteDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        name={deleting?.name ?? ""}
        onConfirm={handleConfirmDelete}
        deleting={saving}
      />
    </div>
  );
}
