"use client";

import { useRouter } from "next/navigation";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { ROUTE_SEGMENT, LOOKUP_KIND } from "../const";
import {
  reviewIssuingOrganization, toggleCategory, toggleLookup, toggleRegistrationType, toggleTest,
} from "../store/categories-slice";
import type { CategoryKind } from "../store/categories-slice";
import type { Accreditation, Category, FeeType, Lookup, ModerationStatus, RegistrationType, Test } from "../apis/types";
import type { CategoryTab } from "../types";
import { AccreditationList } from "./accreditation-list";
import { CategoryList } from "./category-list";
import { FeeTypeList } from "./fee-type-list";
import { RegistrationTypeList } from "./registration-type-list";
import { LookupList } from "./lookup-list";
import { TestList } from "./test-list";

export type Deleting = { kind: "fee_type" | "accreditation" | "registration_type"; id: number; name: string };

type DialogSetter<T> = React.Dispatch<React.SetStateAction<{ open: boolean; editing: T | null }>>;

type Props = Readonly<{
  tab: CategoryTab;
  isCategoryTab: boolean;
  categoryKind: CategoryKind;
  categories: Category[];
  lookupTab: "degree_levels" | "areas_of_study" | null;
  lookups: Lookup[];
  run: (action: Promise<{ meta: { requestStatus: string } }>, message: string) => Promise<boolean>;
  handleReview: (kind: Deleting["kind"], id: number, decision: ModerationStatus) => void;
  setLookupDialog: DialogSetter<Lookup>;
  setTestDialog: DialogSetter<Test>;
  setFeeTypeDialog: DialogSetter<FeeType>;
  setAccreditationDialog: DialogSetter<Accreditation>;
  setRegistrationTypeDialog: DialogSetter<RegistrationType>;
  setDeleting: (deleting: Deleting) => void;
}>;

/** The active tab's list (or its loading / error state) on the categories page. */
export function CategoriesTabContent({
  tab, isCategoryTab, categoryKind, categories, lookupTab, lookups, run, handleReview,
  setLookupDialog, setTestDialog, setFeeTypeDialog, setAccreditationDialog, setRegistrationTypeDialog, setDeleting,
}: Props) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const catalog = useAppSelector((state) => state.platformCategories);

  let tabContent: React.ReactNode;
  if (catalog.status === "loading") {
    tabContent = <ListSkeleton count={6} itemClassName="h-14" />;
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

        {tab === "tests" && (
          <TestList
            items={catalog.tests.data}
            onToggle={(id, is_active) => void run(dispatch(toggleTest({ id, is_active })), "Test updated")}
            onEdit={(editing) => setTestDialog({ open: true, editing })}
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

        {tab === "registration_types" && (
          <RegistrationTypeList
            items={catalog.registrationTypes.data}
            onToggle={(id, is_active) =>
              void run(dispatch(toggleRegistrationType({ id, is_active })), "Registration type updated")
            }
            onEdit={(editing) => setRegistrationTypeDialog({ open: true, editing })}
            onDelete={(item) => setDeleting({ kind: "registration_type", id: item.id, name: item.code })}
          />
        )}

        {tab === "accreditations" && (
          <AccreditationList
            items={catalog.accreditations.data}
            countries={catalog.countries}
            onReview={(id, decision) => handleReview("accreditation", id, decision)}
            onReviewIssuer={(id, decision) =>
              void run(dispatch(reviewIssuingOrganization({ id, decision })), decision === "approved" ? "Issuer approved" : "Issuer rejected")}
            onEdit={(editing) => setAccreditationDialog({ open: true, editing })}
            onDelete={(item) => setDeleting({ kind: "accreditation", id: item.id, name: item.name })}
          />
        )}
      </>
    );
  }

  return tabContent;
}
