export type ModerationStatus = "pending" | "approved" | "rejected";

export type PaginationMeta = { page: number; limit: number; total: number; totalPages: number };
export type Paginated<T> = { data: T[]; meta: PaginationMeta };
export type ListParams = { page?: number; limit?: number };
export type SearchListParams = ListParams & { search?: string };

/** Available on every category kind. Keep in sync with CORE_SCHEMA_FIELD_TYPES on the backend. */
export type CoreSchemaFieldType = "text" | "number" | "boolean" | "date" | "select" | "multi_select";

/**
 * Booking-form types only an **Other** Service Category may use. The server rejects them on business and
 * service categories, whose forms render by key rather than by type.
 */
export type BookingSchemaFieldType = "long_text" | "time" | "datetime" | "email" | "phone" | "radio" | "checkbox";

export type SchemaFieldType = CoreSchemaFieldType | BookingSchemaFieldType;

/** Bounds an admin can put on one answer. All optional. */
export type SchemaFieldValidation = {
  min?: number;
  max?: number;
  min_length?: number;
  max_length?: number;
  pattern?: string;
};

export type SchemaField = {
  id: number;
  key: string;
  label: string;
  type: SchemaFieldType;
  options?: (string | number)[] | null;
  is_required?: boolean;
  filterable?: boolean;
  is_default?: boolean;
  /** The order the admin arranged. Assigned by the server on create; changed by reorderSchemaFields. */
  display_order?: number;
  placeholder?: string | null;
  help_text?: string | null;
  /** Text whatever the field type; coerced per type when the booking form prefills it. */
  default_value?: string | null;
  validation?: SchemaFieldValidation | null;
};

export type SchemaFieldInput = Omit<SchemaField, "id">;

export type SchemaFieldEntityType = "business_categories" | "service_categories" | "other_service_categories";

export type Category = {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  is_active: boolean;
  sort_order: number;
  schema_fields: SchemaField[];
};

export type CategoryInput = {
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  is_active: boolean;
  sort_order: number;
};

/** degree_levels and areas_of_study share one shape. */
export type Lookup = {
  id: number;
  name: string;
  slug: string;
  sort_order: number;
  is_active: boolean;
};

export type LookupInput = Omit<Lookup, "id">;

export type LookupKind = "degree-levels" | "areas-of-study";

export type FeeType = {
  id: number;
  name: string;
  slug: string;
  business_id: number | null;
  status: ModerationStatus;
  is_global: boolean;
  sort_order: number;
};

export type FeeTypeInput = {
  name: string;
  slug: string;
  sort_order: number;
  is_global: boolean;
};

export type IssuingOrganization = {
  id: number;
  name: string;
  logo_url: string | null;
  website: string | null;
};

export type Accreditation = {
  id: number;
  name: string;
  issuing_organization_id: number | null;
  issuing_organization_name: string | null;
  issuing_organization_logo_url: string | null;
  website: string | null;
  description: string | null;
  business_id: number | null;
  is_global: boolean;
  status: ModerationStatus;
  sort_order: number;
  scope_country_ids: number[];
};

export type AccreditationInput = {
  name: string;
  issuing_organization_id: number | null;
  website: string | null;
  description: string | null;
  sort_order: number;
  scope_country_ids: number[];
};

export type CountryOption = {
  id: number;
  name: string;
  iso2: string;
  phoneCode: string | null;
};

export type CityOption = {
  id: number;
  name: string;
  stateName: string | null;
};
