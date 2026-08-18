#!/usr/bin/env python3
"""Generate W7's mapping.json entries.

Not part of the migration: a one-shot authoring aid kept next to the wave so the
34 W7 mappings can be regenerated from one table of decisions instead of being
hand-edited in JSON. It introspects v1_staging and REFUSES to emit a mapping
whose source columns are not all either mapped or declared dropped -- the same
rule Gate 2's coverage check enforces, applied at authoring time.

    python3 scripts/migration/gen-w7-mappings.py            # check only
    python3 scripts/migration/gen-w7-mappings.py --write     # merge into mapping.json
"""

import json
import os
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
MAPPING = HERE / "mapping.json"
URL = os.environ.get("V3_DATABASE_URL", "postgresql://master_user:password@localhost:5432/globalyapp")

# ---------------------------------------------------------------- SQL fragments

ORGS = (
    "(SELECT (b.meta->>'v1_business_id')::uuid AS v1_business_id, 'business'::text AS org_type, b.id AS org_id "
    "FROM public.businesses b WHERE b.deleted_at IS NULL AND b.meta->>'v1_business_id' IS NOT NULL "
    "UNION ALL "
    "SELECT i.v1_business_id, 'institution'::text, i.id FROM public.institutions i "
    "WHERE i.deleted_at IS NULL AND i.v1_business_id IS NOT NULL)"
)


def org_rev(type_col, id_col):
    """A polymorphic org reference, resolved back to the V1 business uuid."""
    return f"(SELECT o.v1_business_id::text FROM {ORGS} o WHERE o.org_type = {type_col} AND o.org_id = {id_col})"


def user_rev(col):
    """A platform_users id, resolved back to the V1 auth uuid it preserves."""
    return f"(SELECT pu.uuid::text FROM public.platform_users pu WHERE pu.id = {col})"


def vocab(v1_table, v1_col, v3_table, v3_col, key="slug"):
    """A uuid -> serial reference, compared by resolving each side back to its natural key."""
    return (
        f"(SELECT v.{key} FROM v1_staging.{v1_table} v WHERE v.id = s.{v1_col})",
        f"(SELECT p.{key} FROM public.{v3_table} p WHERE p.id = t.{v3_col})",
    )


def tenant_parent(table, col):
    """A tenant child's parent FK, resolved back through v1_id."""
    return (f"s.{col}::text", f'(SELECT c.v1_id::text FROM "{{{{schema}}}}".{table} c WHERE c.id = t.{col.replace("_id", "_id")})')


def schema_expand(table):
    """Every tenant schema that actually carries `table`, businesses and institutions alike."""
    return (
        "SELECT x.schema FROM ("
        "SELECT schema_name::text AS schema FROM public.businesses WHERE deleted_at IS NULL AND schema_name IS NOT NULL"
        " UNION "
        "SELECT schema_name::text FROM public.institutions WHERE deleted_at IS NULL AND schema_name IS NOT NULL"
        ") x WHERE EXISTS (SELECT 1 FROM information_schema.tables it "
        f"WHERE it.table_schema = x.schema AND it.table_name = '{table}') ORDER BY 1"
    )


ID_DROP = "Not copied as a value — it IS the identity key. V3 mints its own id and keeps the V1 uuid in v1_id, which is what makes this wave a natural-key upsert."
OWNER_DROP = "Part of the identity of the TENANT, not of the row: it selects WHICH schema the row lives in. Inside that schema it would be a constant repeated on every row."


MONEY_NOTE = ("V1 stores this as unconstrained `numeric`, V3 as numeric(_,2), so 5 and 5.00 are the same amount "
              "written two ways. Both sides are cast to numeric(14,2) for the comparison — a scale difference is a "
              "formatting artefact, and letting it read as a mismatch would bury a real one.")


def money(name, frm, source_expr, target_expr, note=None):
    """A money column, compared at a fixed scale on both sides."""
    return col(name, frm, f"({source_expr})::numeric(14,2)", f"({target_expr})::numeric(14,2)",
               note=(note + " " + MONEY_NOTE) if note else MONEY_NOTE)


def plain(*names):
    return [{"name": n, "from": n, "source": f"s.{n}", "target": f"t.{n}"} for n in names]


def col(name, frm, source, target, note=None):
    c = {"name": name, "from": frm, "source": source, "target": target}
    if note:
        c["note"] = note
    return c


def mapping(name, description, src, tgt, ident, columns, dropped, junction=None, schema_expand_table=None,
            src_joins=None, tgt_joins=None, tgt_filter=None):
    m = {"name": name, "description": description}
    if junction:
        m["junction"] = {"parents": junction}
    m["source"] = {"table": f"v1_staging.{src}", "alias": "s", "joins": src_joins or [], "filter": None}
    m["target"] = {"table": tgt, "alias": "t", "joins": tgt_joins or [], "filter": tgt_filter}
    if schema_expand_table:
        m["target"]["schemaExpand"] = schema_expand(schema_expand_table)
    m["identity"] = ident
    m["extraTargetRows"] = {"policy": "fail"}
    m["columns"] = columns
    m["dropped"] = dropped
    return m


V1_ID = {"label": "id (V1 uuid, preserved in v1_id)", "source": "s.id::text", "target": "t.v1_id::text"}
TENANT_FILTER = "t.deleted_at IS NULL"

MAPPINGS = []

# ------------------------------------------------------------- tenant services

MAPPINGS.append(mapping(
    "business_services_tenant",
    "V1 public.business_services -> the per-tenant business_services table in each owner's own schema. "
    "C1 dropped the thin table's serial id and renamed its uuid to id, so V1's id lands in v1_id and every child "
    "resolves its parent through v1_id -> id. 14 of the 39 unclaimed institutions own 363 of the 402 rows, so the "
    "schema list spans businesses AND institutions.",
    "business_services", '"{{schema}}".business_services', V1_ID,
    plain("name", "slug", "description", "overview", "price", "price_currency", "price_type", "duration_value",
          "duration_unit", "image_url", "brochure_url", "tags", "study_mode", "created_at", "updated_at") + [
        col("is_published", "is_published", "coalesce(s.is_published, false)", "t.is_published"),
        col("is_featured", "is_featured", "coalesce(s.is_featured, false)", "t.is_featured"),
        col("gallery_urls", "gallery_urls", "coalesce(s.gallery_urls, '[]'::jsonb)", "t.gallery_urls"),
        col("public_visibility", "public_visibility", "coalesce(s.public_visibility, '{}'::jsonb)", "t.public_visibility"),
        col("category_specific_data", "category_specific_data", "coalesce(s.category_specific_data, '{}'::jsonb)", "t.category_specific_data"),
        col("service_category_slug", "category_id", *vocab("service_categories", "category_id", "service_categories", "service_category_id"),
            note="uuid -> serial FK, compared by resolving each side's id back to the slug (§15 decision 3: the public vocabulary)."),
        col("degree_level_slug", "degree_level_id", *vocab("degree_levels", "degree_level_id", "degree_levels", "degree_level_id")),
        col("area_of_study_slug", "area_of_study_id", *vocab("areas_of_study", "area_of_study_id", "areas_of_study", "area_of_study_id")),
        col("awarded_by_v1_business", "awarded_by_business_id", "s.awarded_by_business_id::text",
            org_rev("t.awarded_by_org_type", "t.awarded_by_org_id"),
            note="V1's single businesses table split into businesses + institutions, so the awarding body became polymorphic. Compared by resolving the pair back to the V1 business uuid."),
    ],
    [
        {"column": "id", "reason": ID_DROP},
        {"column": "business_id", "reason": OWNER_DROP},
        {"column": "embedding", "reason": "V1 stores a text embedding at 1536 dims (OpenAI); V3 declares vector(3072) and wave E1 re-embeds with its own model. A vector from a different model cannot be compared by cosine distance, so a widened copy would be silently wrong rather than loudly missing."},
    ],
    schema_expand_table="business_services", tgt_filter=TENANT_FILTER,
))

SERVICE_PARENT = col("service_v1_id", "service_id", "s.service_id::text",
                     '(SELECT c.v1_id::text FROM "{{schema}}".business_services c WHERE c.id = t.service_id)',
                     note="The V3 service uuid is V3's own; the parent is resolved back through v1_id.")

MAPPINGS.append(mapping(
    "service_fees_tenant",
    "V1 public.service_fees -> the per-tenant service_fees table. V3 adds fee_type_id, which V1 never had; it stays NULL.",
    "service_fees", '"{{schema}}".service_fees', V1_ID,
    plain("name", "student_type", "period_type", "currency", "total_amount", "installments", "save_for_reuse",
          "created_at", "updated_at") + [SERVICE_PARENT],
    [{"column": "id", "reason": ID_DROP}],
    schema_expand_table="service_fees", tgt_filter=TENANT_FILTER,
))

MAPPINGS.append(mapping(
    "service_fee_structures_tenant",
    "V1 public.service_fee_structures -> the per-tenant service_fee_structures table.",
    "service_fee_structures", '"{{schema}}".service_fee_structures', V1_ID,
    plain("name", "applicable_to", "period", "currency", "created_at", "updated_at") + [SERVICE_PARENT],
    [{"column": "id", "reason": ID_DROP}],
    schema_expand_table="service_fee_structures", tgt_filter=TENANT_FILTER,
))

MAPPINGS.append(mapping(
    "service_fee_installments_tenant",
    "V1 public.service_fee_installments -> the per-tenant service_fee_installments table. Hangs off a fee STRUCTURE, "
    "not a service, so its tenant is reached one hop further out.",
    "service_fee_installments", '"{{schema}}".service_fee_installments', V1_ID,
    [
        col("fee_structure_v1_id", "fee_structure_id", "s.fee_structure_id::text",
            '(SELECT c.v1_id::text FROM "{{schema}}".service_fee_structures c WHERE c.id = t.fee_structure_id)'),
        col("sort_order", "sort_order", "coalesce(s.sort_order, 0)", "t.sort_order"),
    ] + plain("created_at"),
    [{"column": "id", "reason": ID_DROP}],
    schema_expand_table="service_fee_installments", tgt_filter=TENANT_FILTER,
))

MAPPINGS.append(mapping(
    "service_intakes_tenant",
    "V1 public.service_intakes -> the per-tenant service_intakes table. V3 also has a service_intake_assignments "
    "junction, which V1 has no source table for; nothing is loaded into it.",
    "service_intakes", '"{{schema}}".service_intakes', V1_ID,
    plain("intake_name", "start_date", "end_date", "orientation_date", "admission_deadline", "intake_month",
          "intake_year", "save_for_reuse", "created_at", "updated_at") + [SERVICE_PARENT],
    [{"column": "id", "reason": ID_DROP}],
    schema_expand_table="service_intakes", tgt_filter=TENANT_FILTER,
))

MAPPINGS.append(mapping(
    "service_eligibility_requirements_tenant",
    "V1 public.service_eligibility_requirements -> the per-tenant table. V3 adds a degree_level_id FK alongside V1's "
    "free-text min_degree_level; V1 has no id to resolve, so it stays NULL and the text is carried unchanged.",
    "service_eligibility_requirements", '"{{schema}}".service_eligibility_requirements', V1_ID,
    plain("name", "applicable_to", "min_degree_level", "min_score_percent", "min_score_grade", "min_grading_system",
          "description", "academic_tests", "language_tests", "save_for_reuse", "created_at", "updated_at") + [
        col("min_scores", "min_scores", "coalesce(s.min_scores, '[]'::jsonb)", "t.min_scores"),
        col("applicable_countries", "applicable_countries", "coalesce(s.applicable_countries, '{}'::text[])", "t.applicable_countries"),
        SERVICE_PARENT,
    ],
    [{"column": "id", "reason": ID_DROP}],
    schema_expand_table="service_eligibility_requirements", tgt_filter=TENANT_FILTER,
))

MAPPINGS.append(mapping(
    "service_study_options_tenant",
    "V1 public.service_study_options -> the per-tenant service_study_options table. A reusable library keyed on the "
    "owner rather than on a service, so business_id selects the schema. V3 adds an optional `name`, which V1 lacks.",
    "service_study_options", '"{{schema}}".service_study_options', V1_ID,
    plain("study_mode", "study_load", "duration_value", "duration_unit", "applicable_to", "created_at", "updated_at") + [
        col("save_for_reuse", "save_for_reuse", "coalesce(s.save_for_reuse, false)", "t.save_for_reuse"),
    ],
    [{"column": "id", "reason": ID_DROP}, {"column": "business_id", "reason": OWNER_DROP}],
    schema_expand_table="service_study_options", tgt_filter=TENANT_FILTER,
))

MAPPINGS.append(mapping(
    "service_study_units_tenant",
    "V1 public.service_study_units -> the per-tenant service_study_units table. The second reusable library, also "
    "owner-keyed.",
    "service_study_units", '"{{schema}}".service_study_units', V1_ID,
    plain("unit_code", "unit_name", "credit_points", "description", "created_at", "updated_at"),
    [{"column": "id", "reason": ID_DROP}, {"column": "business_id", "reason": OWNER_DROP}],
    schema_expand_table="service_study_units", tgt_filter=TENANT_FILTER,
))

MAPPINGS.append(mapping(
    "branches_tenant",
    "V1 public.branches (the PHYSICAL branch/campus: name, country, city, address) -> the per-tenant "
    "business_branches table. Not to be confused with V1 public.business_branches, the cross-tenant parent/child org "
    "graph, which is master (see business_branches_master). This is the one tenant table with no v1_id column: its "
    "external identity is `uuid`, so the V1 branch uuid lands there and is the upsert key.",
    "branches", '"{{schema}}".business_branches',
    {"label": "id (V1 uuid, preserved in uuid)", "source": "s.id::text", "target": "t.uuid::text"},
    plain("name", "country", "state", "city", "address", "phone", "email", "created_at", "updated_at") + [
        col("is_primary", "is_primary", "coalesce(s.is_primary, false)", "t.is_primary"),
    ],
    [
        {"column": "id", "reason": "Not copied as a value — it IS the identity key, carried in the tenant table's `uuid` column (there is no v1_id column here)."},
        {"column": "business_id", "reason": OWNER_DROP},
    ],
    schema_expand_table="business_branches", tgt_filter=TENANT_FILTER,
))

# ---------------------------------------------------------- tenant junctions (D8)

JUNCTIONS = [
    ("service_fee_assignments", "service_fees_tenant", "service_fee_id", "service_fees", [], None),
    ("service_eligibility_assignments", "service_eligibility_requirements_tenant", "eligibility_requirement_id",
     "service_eligibility_requirements", [], None),
    ("service_study_option_assignments", "service_study_options_tenant", "study_option_id", "service_study_options", [], None),
    ("service_study_unit_assignments", "service_study_units_tenant", "study_unit_id", "service_study_units", ["unit_type"], None),
]
for table, parent_mapping, fk, parent_table, extra, _ in JUNCTIONS:
    MAPPINGS.append(mapping(
        f"{table}_tenant",
        f"V1 public.{table} -> the per-tenant {table} junction. Defect D8: both parents must reconcile before its own "
        f"numbers mean anything, so it loads last and behind assertParentCounts.",
        table, f'"{{{{schema}}}}".{table}', V1_ID,
        [
            SERVICE_PARENT,
            col(f"{fk[:-3]}_v1_id", fk, f"s.{fk}::text",
                f'(SELECT c.v1_id::text FROM "{{{{schema}}}}".{parent_table} c WHERE c.id = t.{fk})'),
        ] + plain(*extra) + plain("created_at"),
        [{"column": "id", "reason": ID_DROP}],
        junction=["business_services_tenant", parent_mapping],
        schema_expand_table=table, tgt_filter=TENANT_FILTER,
    ))

MAPPINGS.append(mapping(
    "service_accreditation_assignments_tenant",
    "V1 public.service_accreditation_assignments -> the per-tenant junction. accreditation_id is NOT NULL and points "
    "at the public.accreditations vocabulary W2 loaded on `name`, so the comparison uses that same key.",
    "service_accreditation_assignments", '"{{schema}}".service_accreditation_assignments', V1_ID,
    [
        SERVICE_PARENT,
        col("accreditation_name", "accreditation_id",
            *vocab("accreditations", "accreditation_id", "accreditations", "accreditation_id", key="name"),
            note="W2 loaded accreditations on `name` (unique on both sides, 30/30), so this must compare on the same key."),
    ] + plain("registration_number", "created_at"),
    [{"column": "id", "reason": ID_DROP}],
    junction=["business_services_tenant", "accreditations"],
    schema_expand_table="service_accreditation_assignments", tgt_filter=TENANT_FILTER,
))

# --------------------------------------------------------- master cross-tenant

MASTER_NOTE = ("MASTER, never tenant (§1.2, §14): a cross-tenant FK inside one tenant's schema gives the other tenant "
               "a leg it cannot read. Every org reference is polymorphic in V3 and is compared by resolving the "
               "(org_type, org_id) pair back to the V1 business uuid.")

MAPPINGS.append(mapping(
    "business_branches_master",
    "V1 public.business_branches (the cross-tenant parent/child ORG graph) -> public.business_branches. " + MASTER_NOTE,
    "business_branches", "public.business_branches", V1_ID,
    [
        col("parent_v1_business", "parent_business_id", "s.parent_business_id::text", org_rev("t.parent_org_type", "t.parent_org_id")),
        col("child_v1_business", "child_business_id", "s.child_business_id::text", org_rev("t.child_org_type", "t.child_org_id")),
    ] + plain("branch_type", "created_at"),
    [{"column": "id", "reason": ID_DROP}],
    tgt_filter=TENANT_FILTER,
))

MAPPINGS.append(mapping(
    "representations_master",
    "V1 public.representations (agent <-> institution) -> public.representations. " + MASTER_NOTE,
    "representations", "public.representations", V1_ID,
    [
        col("agent_v1_business", "agent_id", "s.agent_id::text", org_rev("t.agent_org_type", "t.agent_org_id")),
        col("institution_v1_business", "institution_id", "s.institution_id::text", org_rev("t.institution_org_type", "t.institution_org_id")),
        col("status", "status", "coalesce(s.status, 'pending')", "t.status"),
        col("initiated_by_uuid", "initiated_by", "s.initiated_by::text", user_rev("t.initiated_by"),
            note="Nullable on both sides: a representation outlives the account that initiated it, so an unresolved actor is a NULL plus a report, not a lost relationship."),
        col("responded_by_uuid", "responded_by", "s.responded_by::text", user_rev("t.responded_by")),
    ] + plain("regions", "services", "contract_url", "valid_from", "valid_until", "notes", "responded_at",
              "created_at", "updated_at"),
    [{"column": "id", "reason": ID_DROP}],
    tgt_filter=TENANT_FILTER,
))

MAPPINGS.append(mapping(
    "service_branch_sharing_master",
    "V1 public.service_branch_sharing -> public.service_branch_sharing. " + MASTER_NOTE + " service_id is a TENANT "
    "uuid V3 minted itself, so it is resolved back through mig.map_services, the view w7-services rebuilds over every "
    "tenant schema on each run. No `junction` declaration: check 5 names exactly two parent MAPPINGS, and this row's "
    "second parent is an org that may live in either public.businesses or public.institutions — so its D8 "
    "reconciliation is asserted in the transform (assertParentCounts over every tenant schema) rather than declared "
    "against an arbitrarily chosen half of the org leg.",
    "service_branch_sharing", "public.service_branch_sharing", V1_ID,
    [
        col("service_v1_id", "service_id", "s.service_id::text",
            "(SELECT ms.v1_id::text FROM mig.map_services ms WHERE ms.id = t.service_id)"),
        col("branch_v1_business", "branch_business_id", "s.branch_business_id::text", org_rev("t.branch_org_type", "t.branch_org_id")),
        col("shared_by_uuid", "shared_by", "s.shared_by::text", user_rev("t.shared_by")),
        col("shared_at", "shared_at", "coalesce(s.shared_at, now())", "t.shared_at"),
    ] + plain("scope"),
    [{"column": "id", "reason": ID_DROP}],
    tgt_filter=TENANT_FILTER,
))

MAPPINGS.append(mapping(
    "service_study_option_branches_master",
    "V1 public.service_study_option_branches -> public.service_study_option_branches. " + MASTER_NOTE +
    " study_option_id resolves back through mig.map_study_options. D8 is asserted in the transform for the same reason "
    "as service_branch_sharing_master.",
    "service_study_option_branches", "public.service_study_option_branches", V1_ID,
    [
        col("study_option_v1_id", "study_option_id", "s.study_option_id::text",
            "(SELECT mo.v1_id::text FROM mig.map_study_options mo WHERE mo.id = t.study_option_id)"),
        col("branch_v1_business", "branch_business_id", "s.branch_business_id::text", org_rev("t.branch_org_type", "t.branch_org_id")),
        col("created_at", "created_at", "coalesce(s.created_at, now())", "t.created_at"),
    ],
    [{"column": "id", "reason": ID_DROP}],
    tgt_filter=TENANT_FILTER,
))

MAPPINGS.append(mapping(
    "business_allowed_categories_master",
    "V1 public.business_allowed_categories -> public.business_allowed_categories. " + MASTER_NOTE + " V1's "
    "`category_id` is a SERVICE category uuid — all 34 rows resolve in v1_staging.service_categories and none in "
    "business_categories — and V3 names the column service_category_id accordingly.",
    "business_allowed_categories", "public.business_allowed_categories", V1_ID,
    [
        col("owner_v1_business", "business_id", "s.business_id::text", org_rev("t.owner_org_type", "t.owner_org_id")),
        col("service_category_slug", "category_id", *vocab("service_categories", "category_id", "service_categories", "service_category_id")),
        col("granted_by_uuid", "granted_by", "s.granted_by::text", user_rev("t.granted_by")),
    ] + plain("created_at"),
    [{"column": "id", "reason": ID_DROP}],
    tgt_filter=TENANT_FILTER,
))

# ------------------------------------------------------------------- billing

FOLDED = {
    "pay_per_lead_cost": "integer",
    "pay_per_application_cost": "integer",
    "max_ad_campaigns": "integer",
    "max_events_per_month": "integer",
    "max_job_postings": "integer",
    "max_ambassador_programs": "integer",
    "max_branch_connections": "integer",
    "has_analytics": "boolean",
    "has_api_access": "boolean",
    "has_ai_tools": "boolean",
}

MAPPINGS.append(mapping(
    "subscription_plans_master",
    "V1 public.subscription_plans -> public.subscription_plans. `slug` becomes `code`. Ten V1 columns V3 has no "
    "column for — per-lead pricing, five entitlement caps, three feature flags — FOLD into the `limits` jsonb C3 gave "
    "the plan for exactly that, under their V1 names, and are compared through it rather than declared lost.",
    "subscription_plans", "public.subscription_plans", V1_ID,
    plain("name", "description", "tagline", "currency", "trial_days",
          "stripe_monthly_price_id", "stripe_annual_price_id", "monthly_ai_credits", "is_active", "is_public",
          "is_popular", "sort_order", "feature_highlights", "created_at", "updated_at") + [
        money("monthly_price", "monthly_price", "s.monthly_price", "t.monthly_price"),
        money("annual_price", "annual_price", "s.annual_price", "t.annual_price"),
        col("code", "slug", "s.slug", "t.code", note="V1 `slug` is V3's `code`; both are the plan's stable natural key."),
        col("monthly_credit_grant", "monthly_credit_grant", "coalesce(s.monthly_credit_grant, 0)", "t.monthly_credit_grant"),
        col("personal_credit_per_member", "personal_credit_per_member", "coalesce(s.personal_credit_per_member, 0)", "t.personal_credit_per_member"),
    ] + [
        col(f"limits_{c}", c, f"s.{c}", f"(t.limits->>'{c}')::{typ}",
            note="No V3 column; folded into subscription_plans.limits under its V1 name.")
        for c, typ in FOLDED.items()
    ],
    [{"column": "id", "reason": ID_DROP}],
    tgt_filter=TENANT_FILTER,
))

PLAN_CODE = col("plan_code", "plan_id",
                "(SELECT v.slug FROM v1_staging.subscription_plans v WHERE v.id = s.plan_id)",
                "(SELECT p.code FROM public.subscription_plans p WHERE p.id = t.plan_id)")

MAPPINGS.append(mapping(
    "subscription_plan_features_master",
    "V1 public.subscription_plan_features -> public.subscription_plan_features. 0 V1 rows; the loader exists so the "
    "table is not a surprise at cutover.",
    "subscription_plan_features", "public.subscription_plan_features", V1_ID,
    plain("feature_key", "feature_label", "feature_value") + [
        PLAN_CODE,
        col("is_included", "is_included", "coalesce(s.is_included, true)", "t.is_included"),
        col("sort_order", "sort_order", "coalesce(s.sort_order, 0)", "t.sort_order"),
    ],
    [{"column": "id", "reason": ID_DROP}],
    tgt_filter=TENANT_FILTER,
))

MAPPINGS.append(mapping(
    "coupons_master",
    "V1 public.coupons -> public.coupons. Master-level catalogue alongside the plans (§4 W7).",
    "coupons", "public.coupons", V1_ID,
    plain("code", "description", "discount_type", "applicable_plans", "valid_from", "valid_until",
          "max_uses", "current_uses", "is_active", "created_at") + [
        money("discount_value", "discount_value", "s.discount_value", "t.discount_value"),
    ],
    [{"column": "id", "reason": ID_DROP}],
    tgt_filter=TENANT_FILTER,
))

BIZ_ONLY = col("business_v1_id", "business_id", "s.business_id::text",
               "(SELECT b.meta->>'v1_business_id' FROM public.businesses b WHERE b.id = t.business_id)",
               note="business_id FKs to public.businesses ONLY — C3 did not make this table polymorphic. A V1 business "
                    "that migrated as an institution therefore has no V3 home here and is reason-coded "
                    "unresolved_business rather than pointed at an institution id.")

MAPPINGS.append(mapping(
    "business_subscriptions_master",
    "V1 public.business_subscriptions -> public.business_subscriptions. 22 of the 33 V1 rows (all `expired`) belong to "
    "a V1 business that W1 migrated as an INSTITUTION, and business_id FKs to businesses only — those 22 are "
    "reason-coded unresolved_business, which is what the count reconciliation accepts them as.",
    "business_subscriptions", "public.business_subscriptions", V1_ID,
    plain("status", "stripe_subscription_id", "stripe_customer_id", "current_period_start", "current_period_end",
          "trial_ends_at", "canceled_at", "downgrade_at", "monthly_credit_grant", "personal_credit_per_member",
          "created_at", "updated_at") + [BIZ_ONLY, PLAN_CODE],
    [{"column": "id", "reason": ID_DROP}],
    tgt_filter=TENANT_FILTER,
))

MAPPINGS.append(mapping(
    "business_ai_credits_master",
    "V1 public.business_ai_credits -> public.business_ai_credits. Per-period AI credit grant/consumption, "
    "businesses-only like the subscription it hangs off.",
    "business_ai_credits", "public.business_ai_credits", V1_ID,
    plain("period_start", "period_end", "granted", "used", "created_at", "updated_at") + [BIZ_ONLY],
    [{"column": "id", "reason": ID_DROP}],
    tgt_filter=TENANT_FILTER,
))

MAPPINGS.append(mapping(
    "credit_wallets_master",
    "V1 public.credit_wallets -> public.credit_wallets. V3 keeps V1's polymorphic owner_type/(user | business) shape "
    "(reconciliation log §5) and adds free_balance, which V1 never had and which is left at the V3 default rather "
    "than derived from the other three balances. 22 of the 35 business-owned wallets belong to a V1 business that "
    "migrated as an institution and are reason-coded unresolved_business.",
    "credit_wallets", "public.credit_wallets", V1_ID,
    plain("owner_type", "balance", "subscription_balance", "purchased_balance", "lifetime_earned", "lifetime_spent",
          "created_at", "updated_at") + [
        col("owner_v1_user", "user_id", "s.user_id::text", user_rev("t.platform_user_id")),
        col("owner_v1_business", "business_id", "s.business_id::text",
            "(SELECT b.meta->>'v1_business_id' FROM public.businesses b WHERE b.id = t.business_id)"),
    ],
    [{"column": "id", "reason": ID_DROP}],
    tgt_filter=TENANT_FILTER,
))

MAPPINGS.append(mapping(
    "credit_transactions_master",
    "V1 public.credit_transactions -> public.credit_transactions, one polymorphic ledger carrying V1's shape "
    "(reconciliation log §5 decision D). V3 adds balance_type, reason and idempotency_key, none of which V1 had. "
    "The 22 transactions on the 22 unmigratable wallets are reason-coded unresolved_parent. Not declared a `junction`: "
    "it has ONE required parent (the wallet), asserted in the transform; performed_by is a nullable actor, not a parent.",
    "credit_transactions", "public.credit_transactions", V1_ID,
    plain("transaction_type", "amount", "balance_after", "subscription_amount", "purchased_amount", "description",
          "reference_type", "reference_id", "created_at") + [
        col("wallet_v1_id", "wallet_id", "s.wallet_id::text",
            "(SELECT w.v1_id::text FROM public.credit_wallets w WHERE w.id = t.wallet_id)"),
        col("performed_by_uuid", "performed_by", "s.performed_by::text", user_rev("t.performed_by")),
    ],
    [{"column": "id", "reason": ID_DROP}],
    tgt_filter=TENANT_FILTER,
))

# ---------------------------------------------------------------- engagement

MAPPINGS.append(mapping(
    "events_master",
    "V1 public.events -> public.events. D3's table is live, so per §4 this blocked mapping flips to transform. "
    "business_id becomes the polymorphic host_org_type/host_org_id — an event can be hosted by an unclaimed "
    "institution as readily as by a business.",
    "events", "public.events", V1_ID,
    plain("title", "slug", "description", "summary", "cover_image_url", "event_type", "category", "status",
          "visibility", "target_audiences", "target_countries", "venue_name", "venue_address", "venue_city",
          "venue_country", "venue_latitude", "venue_longitude", "online_url", "online_platform", "starts_at",
          "ends_at", "timezone", "max_capacity", "registration_deadline", "tags", "contact_email", "contact_phone",
          "published_at", "cancelled_at", "cancellation_reason", "created_at", "updated_at") + [
        col("host_v1_business", "business_id", "s.business_id::text", org_rev("t.host_org_type", "t.host_org_id")),
        col("created_by_uuid", "created_by", "s.created_by::text", user_rev("t.created_by"),
            note="Nullable in V3 (ON DELETE SET NULL): an event outlives the account that created it."),
        col("is_featured", "is_featured", "coalesce(s.is_featured, false)", "t.is_featured"),
        col("views_count", "views_count", "coalesce(s.views_count, 0)", "t.views_count"),
        col("settings", "settings", "coalesce(s.settings, '{}'::jsonb)", "t.settings"),
    ],
    [
        {"column": "id", "reason": ID_DROP},
        {"column": "rsvp_count", "reason": "No V3 column: public.events has no denormalised attendance counter — V3 counts public.event_registrations, which migrate in this same wave, so the number is derived rather than stored. Three V1 rows carry a non-zero value and each is reported to mig.unresolved under no_v3_column so a future schema change can find them."},
    ],
    tgt_filter=TENANT_FILTER,
))

EVENT_PARENT = col("event_v1_id", "event_id", "s.event_id::text",
                   "(SELECT e.v1_id::text FROM public.events e WHERE e.id = t.event_id)")

MAPPINGS.append(mapping(
    "event_tickets_master",
    "V1 public.event_tickets -> public.event_tickets. `sold_count` is V3's `claimed_count` — the counter a hold "
    "increments before payment clears.",
    "event_tickets", "public.event_tickets", V1_ID,
    plain("name", "description", "quantity", "sale_starts_at", "sale_ends_at", "stripe_price_id", "created_at",
          "updated_at") + [
        EVENT_PARENT,
        money("price", "price", "coalesce(s.price, 0)", "t.price"),
        col("currency", "currency", "coalesce(s.currency, 'USD')", "t.currency"),
        col("claimed_count", "sold_count", "coalesce(s.sold_count, 0)", "t.claimed_count"),
        col("max_per_order", "max_per_order", "coalesce(s.max_per_order, 10)", "t.max_per_order"),
        col("is_active", "is_active", "coalesce(s.is_active, true)", "t.is_active"),
        col("sort_order", "sort_order", "coalesce(s.sort_order, 0)", "t.sort_order"),
    ],
    [{"column": "id", "reason": ID_DROP}],
    tgt_filter=TENANT_FILTER,
))

MAPPINGS.append(mapping(
    "event_registrations_master",
    "V1 public.event_registrations -> public.event_registrations. Defect D8: needs both a migrated event and a "
    "migrated registrant. V3 adds hold_expires_at, which V1 never had.",
    "event_registrations", "public.event_registrations", V1_ID,
    plain("status", "stripe_session_id", "check_in_at", "cancelled_at", "notes", "created_at", "updated_at") + [
        EVENT_PARENT,
        col("ticket_v1_id", "ticket_id", "s.ticket_id::text",
            "(SELECT tk.v1_id::text FROM public.event_tickets tk WHERE tk.id = t.ticket_id)"),
        col("registrant_uuid", "user_id", "s.user_id::text", user_rev("t.platform_user_id")),
        col("quantity", "quantity", "coalesce(s.quantity, 1)", "t.quantity"),
        money("total_paid", "total_paid", "coalesce(s.total_paid, 0)", "t.total_paid"),
        col("payment_status", "payment_status", "coalesce(s.payment_status, 'free')", "t.payment_status"),
    ],
    [{"column": "id", "reason": ID_DROP}],
    junction=["events_master", "platform_users"],
    tgt_filter=TENANT_FILTER,
))

MAPPINGS.append(mapping(
    "event_updates_master",
    "V1 public.event_updates -> public.event_updates. author_id is nullable in V3, so an author who did not migrate "
    "leaves the update intact and the column NULL.",
    "event_updates", "public.event_updates", V1_ID,
    plain("title", "content", "created_at") + [
        EVENT_PARENT,
        col("author_uuid", "author_id", "s.author_id::text", user_rev("t.author_id")),
    ],
    [{"column": "id", "reason": ID_DROP}],
    tgt_filter=TENANT_FILTER,
))

MAPPINGS.append(mapping(
    "event_co_hosts_master",
    "V1 public.event_co_hosts -> public.event_co_hosts. 0 V1 rows; business_id becomes the polymorphic "
    "co_host_org_type/co_host_org_id.",
    "event_co_hosts", "public.event_co_hosts", V1_ID,
    plain("status", "role", "created_at", "updated_at") + [
        EVENT_PARENT,
        col("co_host_v1_business", "business_id", "s.business_id::text", org_rev("t.co_host_org_type", "t.co_host_org_id")),
        col("invited_by_uuid", "invited_by", "s.invited_by::text", user_rev("t.invited_by")),
    ],
    [{"column": "id", "reason": ID_DROP}],
    tgt_filter=TENANT_FILTER,
))

MAPPINGS.append(mapping(
    "notifications_master",
    "V1 public.notifications -> public.notifications. Three shape changes: is_read boolean becomes a read_at "
    "timestamp (V1 kept no read time, so a read notification is stamped at its created_at), reference_id widens from "
    "uuid to text so a reference can name a serial row too, and dedupe_key — NOT NULL in V3, with no V1 equivalent — "
    "is derived as 'v1:<uuid>' so each migrated row is its own dedupe class and two V1 notifications can never "
    "collapse onto one (platform_user_id, dedupe_key).",
    "notifications", "public.notifications", V1_ID,
    plain("type", "title", "body", "reference_type", "created_at") + [
        col("recipient_uuid", "user_id", "s.user_id::text", user_rev("t.platform_user_id")),
        col("reference_id", "reference_id", "s.reference_id::text", "t.reference_id"),
        col("read_at", "is_read", "CASE WHEN coalesce(s.is_read, false) THEN s.created_at ELSE NULL END", "t.read_at"),
    ],
    [{"column": "id", "reason": ID_DROP}],
    tgt_filter=TENANT_FILTER,
))

MAPPINGS.append(mapping(
    "ai_counselor_sessions_master",
    "V1 public.ai_counselor_sessions -> public.ai_counselor_sessions. E2's table carries no v1_id column, so the "
    "identity is the natural key (platform_user_id, created_at) — verified unique across all 75 V1 rows, and "
    "re-verified at load time because a cutover re-extract could break it. No deleted_at filter on the target: 22 "
    "sessions are soft-deleted in V1 and their deleted_at carries over, so they are migrated, not missing.",
    "ai_counselor_sessions", "public.ai_counselor_sessions",
    {"label": "V1 (user_id, created_at)", "source": "s.user_id::text || '|' || s.created_at::text",
     "target": "pu.uuid::text || '|' || t.created_at::text"},
    plain("title", "message_count", "credits_used", "deleted_at") + [
        col("is_archived", "archived_at", "(s.archived_at IS NOT NULL)", "t.is_archived",
            note="V1 stamps when a session was archived; V3 keeps only the boolean."),
    ],
    [
        {"column": "id", "reason": "V1 uuid PK. public.ai_counselor_sessions has no v1_id column (E2 shipped before this wave), so the identity is the natural key (platform_user_id, created_at) instead — which is also what a message uses to find its session."},
        {"column": "user_id", "reason": "Part of the identity key (resolved to platform_users.id)."},
        {"column": "created_at", "reason": "Part of the identity key, matched exactly on both sides."},
        {"column": "profile_id", "reason": "V1's ai_counselor_profiles has no V3 table — counsellor phase 2 is still in flight on dev-feat-ai-counsellor-p2, so that table stays `blocked` on wave E2. All 75 V1 sessions have profile_id NULL, so nothing is at risk today; a non-NULL value at cutover is a stop-and-classify."},
        {"column": "started_at", "reason": "No V3 column: public.ai_counselor_sessions models the session's lifetime with created_at. started_at equals created_at on all 75 V1 rows, so this is a declared duplicate rather than a loss."},
        {"column": "ended_at", "reason": "No V3 column — V3 has no session end concept, only is_archived and deleted_at. NULL on all 75 V1 rows."},
        {"column": "session_summary", "reason": "No V3 column — the counsellor summary feature is not in V3's session shape. NULL on all 75 V1 rows."},
        {"column": "embed_config_id", "reason": "V1 uuid vs V3 serial FK to public.ai_embed_configs, and NULL on all 75 V1 rows — there is nothing to resolve, and inventing a config id would attach every migrated session to an embed widget it never came from."},
    ],
    tgt_joins=["JOIN public.platform_users pu ON pu.id = t.platform_user_id"],
))

MAPPINGS.append(mapping(
    "ai_counselor_messages_master",
    "V1 public.ai_counselor_messages -> public.ai_counselor_messages. Also has no v1_id, so the identity chains "
    "through its session's natural key: (session owner uuid, session created_at, message created_at). V1's chips "
    "text[] becomes jsonb, and V1's feedback vocabulary ('thumbs_up') becomes V3's ('positive'), which V3 enforces "
    "with a CHECK.",
    "ai_counselor_messages", "public.ai_counselor_messages",
    {"label": "V1 (session owner, session created_at, message created_at)",
     "source": "vs.user_id::text || '|' || vs.created_at::text || '|' || s.created_at::text",
     "target": "pu.uuid::text || '|' || ts.created_at::text || '|' || t.created_at::text"},
    plain("role", "content", "prompt_tokens", "completion_tokens", "total_tokens") + [
        col("sources", "sources", "coalesce(s.sources, '[]'::jsonb)", "t.sources"),
        col("cards", "cards", "coalesce(s.cards, '[]'::jsonb)", "t.cards"),
        col("chips", "chips", "coalesce(to_jsonb(s.chips), '[]'::jsonb)", "t.chips",
            note="V1 text[] -> V3 jsonb."),
        col("feedback", "feedback",
            "(CASE s.feedback WHEN 'thumbs_up' THEN 'positive' WHEN 'thumbs_down' THEN 'negative' "
            "WHEN 'positive' THEN 'positive' WHEN 'negative' THEN 'negative' ELSE NULL END)", "t.feedback",
            note="public.ai_counselor_messages declares CHECK (feedback IN ('positive','negative')); V1's one non-NULL value is 'thumbs_up'. Anything outside the pair is NULLed and reported invalid_source_data."),
    ],
    [
        {"column": "id", "reason": "V1 uuid PK. public.ai_counselor_messages has no v1_id column, so the identity chains through the session's natural key plus the message's own created_at."},
        {"column": "session_id", "reason": "Part of the identity key — resolved through the session's (owner, created_at) natural key, because V3's session id is its own serial."},
        {"column": "created_at", "reason": "Part of the identity key, matched exactly on both sides."},
        {"column": "credits_consumed", "reason": "No V3 column: metering moved to the session's credits_used and, in wave E, to ai_usage_events. 0 on all 301 V1 rows, so nothing is at risk today."},
        {"column": "queries_used", "reason": "No V3 column — retrieval accounting is not part of V3's message shape. 0 on all 301 V1 rows."},
        {"column": "tool_trace", "reason": "No V3 column — V3 does not persist per-message tool traces. NULL on all 301 V1 rows."},
        {"column": "retrieved_doc_ids", "reason": "No V3 column, and the uuids would point at V1 knowledge documents whose V3 ids are serials. V3 carries provenance in `sources` instead. NULL on all 301 V1 rows."},
        {"column": "rating", "reason": "No V3 column — V3 keeps a single `feedback` verdict rather than a numeric rating. NULL on all 301 V1 rows."},
        {"column": "rating_comment", "reason": "No V3 column, for the same reason as `rating`. NULL on all 301 V1 rows."},
    ],
    junction=["ai_counselor_sessions_master", "platform_users"],
    src_joins=["JOIN v1_staging.ai_counselor_sessions vs ON vs.id = s.session_id"],
    tgt_joins=["JOIN public.ai_counselor_sessions ts ON ts.id = t.session_id",
               "JOIN public.platform_users pu ON pu.id = ts.platform_user_id"],
))

# ------------------------------------------------- the ledger entries to flip

FLIP = {
    "events": ["public.events"],
    "event_tickets": ["public.event_tickets"],
    "event_registrations": ["public.event_registrations"],
    "event_updates": ["public.event_updates"],
    "event_co_hosts": ["public.event_co_hosts"],
    "notifications": ["public.notifications"],
}
FLIP_NOTE = ("W7 loads this: D3's table is live on staging-mvp, and per Part 3 §4 a blocked mapping flips to "
             "transform the moment its target schema merges. business_id becomes a polymorphic org reference "
             "(globalyapp/*_events.ts).")


# ------------------------------------------------------------------ coverage

def source_columns():
    sql = ("SELECT table_name, column_name FROM information_schema.columns "
           "WHERE table_schema = 'v1_staging' ORDER BY 1, 2")
    out = subprocess.run(["psql", URL, "-tAF", "\t", "-c", sql], capture_output=True, text=True, check=True).stdout
    cols = {}
    for line in out.strip().split("\n"):
        if not line:
            continue
        t, c = line.split("\t")
        cols.setdefault(t, set()).add(c)
    return cols


def check_coverage(mappings, cols):
    problems = []
    for m in mappings:
        table = m["source"]["table"].split(".", 1)[1]
        actual = cols.get(table)
        if actual is None:
            problems.append(f"{m['name']}: v1_staging.{table} does not exist")
            continue
        accounted = set()
        for c in m["columns"]:
            f = c["from"]
            if f is None:
                continue
            accounted.update(f if isinstance(f, list) else [f])
        for d in m["dropped"]:
            accounted.add(d["column"])
        for missing in sorted(actual - accounted):
            problems.append(f"{m['name']}: v1_staging.{table}.{missing} is neither mapped nor declared dropped")
        for extra in sorted(accounted - actual):
            problems.append(f"{m['name']}: names v1_staging.{table}.{extra}, which does not exist")
    return problems


def main():
    cols = source_columns()
    problems = check_coverage(MAPPINGS, cols)
    if problems:
        for p in problems:
            print(f"COVERAGE  {p}")
        return 1
    print(f"coverage: ok — {len(MAPPINGS)} W7 mappings, every source column mapped or declared dropped")

    if "--write" not in sys.argv:
        return 0

    manifest = json.loads(MAPPING.read_text())
    names = {m["name"] for m in MAPPINGS}
    manifest["mappings"] = [m for m in manifest["mappings"] if m["name"] not in names] + MAPPINGS
    for table, targets in FLIP.items():
        entry = manifest["tables"][table]
        entry.pop("dependency", None)
        entry["disposition"] = "transform"
        entry["targets"] = targets
        entry["note"] = FLIP_NOTE
    MAPPING.write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"wrote {len(MAPPINGS)} mappings and flipped {len(FLIP)} ledger entries into {MAPPING.name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
