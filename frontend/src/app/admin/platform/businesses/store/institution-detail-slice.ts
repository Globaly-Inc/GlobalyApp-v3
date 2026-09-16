import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { businessesApi } from "../apis";
import type {
  BusinessService, BusinessStatus, Contact, ContactInput, ContactListParams, ContactPatch, InstitutionBranch, InstitutionBranchListParams, InstitutionDetail, InstitutionInvitation,
  InstitutionInvitationListParams, InstitutionInviteInput, InstitutionPartnerInput, InstitutionPartnerListParams, InstitutionPartnerPatch, InstitutionPartnerRow,
  InstitutionPatch, InstitutionPermission, InstitutionRole, InstitutionRoleCreateInput, InstitutionRolePatch, Member, MemberListParams,
  SchemaFieldValue, ServiceInput, ServicePatch, ServiceSearchParams,
} from "../apis/types";

// Separate from businesses-slice.ts: institutions have no real contacts/activity/enquiry-settings
// backend yet. Branches here aren't a real CRUD either — they're read-only projections of the
// source extraction job's campuses (see businesses.service.ts on the backend). Partners IS real
// CRUD (business_representations), merged with the same read-only extraction_agents projection.

export const fetchInstitutionDetail = createAsyncThunk("institutionDetail/fetch", (id: number) =>
  businessesApi.getInstitutionDetail(id),
);

export const updateInstitutionDetail = createAsyncThunk(
  "institutionDetail/update",
  ({ id, patch }: { id: number; patch: InstitutionPatch }) => businessesApi.updateInstitution(id, patch),
);

export const fetchInstitutionMembers = createAsyncThunk(
  "institutionDetail/fetchMembers",
  ({ id, params }: { id: number; params?: MemberListParams }) => businessesApi.getInstitutionMembers(id, params),
);

export const fetchInstitutionBranches = createAsyncThunk(
  "institutionDetail/fetchBranches",
  ({ id, params }: { id: number; params?: InstitutionBranchListParams }) => businessesApi.getInstitutionBranches(id, params),
);

// ── Services ──────────────────────────────────────────────────────────────────
export const fetchInstitutionServices = createAsyncThunk(
  "institutionDetail/fetchServices",
  ({ id, params }: { id: number; params?: ServiceSearchParams }) => businessesApi.searchInstitutionServices(id, params),
);
export const createInstitutionService = createAsyncThunk(
  "institutionDetail/createService",
  ({ id, input }: { id: number; input: ServiceInput }) => businessesApi.createInstitutionService(id, input),
);
export const updateInstitutionService = createAsyncThunk(
  "institutionDetail/updateService",
  ({ id, serviceId, patch }: { id: number; serviceId: string; patch: ServicePatch }) =>
    businessesApi.updateInstitutionService(id, serviceId, patch),
);
export const fetchInstitutionServiceFieldValues = createAsyncThunk(
  "institutionDetail/fetchServiceFieldValues",
  ({ id, serviceId }: { id: number; serviceId: string }) => businessesApi.getInstitutionServiceFieldValues(id, serviceId),
);
export const updateInstitutionServiceFieldValues = createAsyncThunk(
  "institutionDetail/updateServiceFieldValues",
  ({ id, serviceId, values }: { id: number; serviceId: string; values: SchemaFieldValue[] }) =>
    businessesApi.updateInstitutionServiceFieldValues(id, serviceId, values),
);
export const toggleInstitutionServicePublished = createAsyncThunk(
  "institutionDetail/toggleServicePublished",
  ({ id, serviceId, is_published }: { id: number; serviceId: string; is_published: boolean }) =>
    businessesApi.setInstitutionServicePublished(id, serviceId, is_published),
);
export const deleteInstitutionServiceThunk = createAsyncThunk(
  "institutionDetail/deleteService",
  async ({ id, serviceId }: { id: number; serviceId: string }) => {
    await businessesApi.deleteInstitutionService(id, serviceId);
    return serviceId;
  },
);

// ── Contacts ──────────────────────────────────────────────────────────────────
export const fetchInstitutionContacts = createAsyncThunk(
  "institutionDetail/fetchContacts",
  ({ id, params }: { id: number; params?: ContactListParams }) => businessesApi.getInstitutionContacts(id, params),
);
export const createInstitutionContact = createAsyncThunk(
  "institutionDetail/createContact",
  ({ id, input }: { id: number; input: ContactInput }) => businessesApi.createInstitutionContact(id, input),
);
export const updateInstitutionContact = createAsyncThunk(
  "institutionDetail/updateContact",
  ({ id, contactId, patch }: { id: number; contactId: string; patch: ContactPatch }) =>
    businessesApi.updateInstitutionContact(id, contactId, patch),
);
export const deleteInstitutionContactThunk = createAsyncThunk(
  "institutionDetail/deleteContact",
  async ({ id, contactId }: { id: number; contactId: string }) => {
    await businessesApi.deleteInstitutionContact(id, contactId);
    return contactId;
  },
);

export const fetchInstitutionPartners = createAsyncThunk(
  "institutionDetail/fetchPartners",
  ({ id, params }: { id: number; params?: InstitutionPartnerListParams }) => businessesApi.getInstitutionPartners(id, params),
);

export const createInstitutionPartner = createAsyncThunk(
  "institutionDetail/createPartner",
  ({ id, input }: { id: number; input: InstitutionPartnerInput }) => businessesApi.createInstitutionPartner(id, input),
);
export const updateInstitutionPartner = createAsyncThunk(
  "institutionDetail/updatePartner",
  ({ id, partnerId, patch }: { id: number; partnerId: string; patch: InstitutionPartnerPatch }) =>
    businessesApi.updateInstitutionPartner(id, partnerId, patch),
);
export const deleteInstitutionPartner = createAsyncThunk(
  "institutionDetail/deletePartner",
  async ({ id, partnerId }: { id: number; partnerId: string }) => {
    await businessesApi.deleteInstitutionPartner(id, partnerId);
    return partnerId;
  },
);

export const inviteInstitutionMember = createAsyncThunk(
  "institutionDetail/inviteMember",
  ({ id, input }: { id: number; input: InstitutionInviteInput }) => businessesApi.inviteInstitutionMember(id, input),
);

export const fetchInstitutionInvitations = createAsyncThunk(
  "institutionDetail/fetchInvitations",
  ({ id, params }: { id: number; params?: InstitutionInvitationListParams }) => businessesApi.getInstitutionInvitations(id, params),
);

export const cancelInstitutionInvitation = createAsyncThunk(
  "institutionDetail/cancelInvitation",
  async ({ id, invitationId }: { id: number; invitationId: string }) => {
    await businessesApi.cancelInstitutionInvitation(id, invitationId);
    return invitationId;
  },
);

export const resendInstitutionInvitation = createAsyncThunk(
  "institutionDetail/resendInvitation",
  async ({ id, invitationId }: { id: number; invitationId: string }) => {
    await businessesApi.resendInstitutionInvitation(id, invitationId);
    return invitationId;
  },
);

// ── Roles ─────────────────────────────────────────────────────────────────────
export const fetchInstitutionRoles = createAsyncThunk(
  "institutionDetail/fetchRoles",
  (id: number) => businessesApi.getInstitutionRoles(id),
);
export const fetchInstitutionPermissions = createAsyncThunk(
  "institutionDetail/fetchPermissions",
  (id: number) => businessesApi.getInstitutionPermissions(id),
);
export const createInstitutionRole = createAsyncThunk(
  "institutionDetail/createRole",
  ({ id, input }: { id: number; input: InstitutionRoleCreateInput }) => businessesApi.createInstitutionRole(id, input),
);
export const updateInstitutionRole = createAsyncThunk(
  "institutionDetail/updateRole",
  ({ id, roleId, patch }: { id: number; roleId: number; patch: InstitutionRolePatch }) =>
    businessesApi.updateInstitutionRole(id, roleId, patch),
);
export const deleteInstitutionRole = createAsyncThunk(
  "institutionDetail/deleteRole",
  async ({ id, roleId }: { id: number; roleId: number }) => {
    await businessesApi.deleteInstitutionRole(id, roleId);
    return roleId;
  },
);

export const setInstitutionMemberStatus = createAsyncThunk(
  "institutionDetail/setMemberStatus",
  async ({ id, platformUserId, accountStatus }: { id: number; platformUserId: number; accountStatus: number }) => {
    await businessesApi.setInstitutionMemberStatus(id, platformUserId, accountStatus);
    return { platformUserId, accountStatus };
  },
);

export const updateInstitutionStatus = createAsyncThunk(
  "institutionDetail/updateStatus",
  async ({ id, status }: { id: number; status: BusinessStatus }) => {
    await businessesApi.updateStatus({ kind: "institution", id }, status);
    return status;
  },
);

export const updateInstitutionPublished = createAsyncThunk(
  "institutionDetail/updatePublished",
  async ({ id, is_published }: { id: number; is_published: boolean }) => {
    await businessesApi.updatePublished({ kind: "institution", id }, is_published);
    return is_published;
  },
);

type PagedState<T> = { items: T[]; total: number; status: "idle" | "loading" | "failed"; error: string | null };

type InstitutionDetailState = {
  detail: InstitutionDetail | null;
  detailStatus: "idle" | "loading" | "failed";
  detailError: string | null;
  members: PagedState<Member>;
  invitations: PagedState<InstitutionInvitation>;
  branches: PagedState<InstitutionBranch>;
  partners: PagedState<InstitutionPartnerRow>;
  services: PagedState<BusinessService>;
  contacts: PagedState<Contact>;
  roles: PagedState<InstitutionRole>;
  permissions: InstitutionPermission[];
};

const emptyPaged = <T,>(): PagedState<T> => ({ items: [], total: 0, status: "idle", error: null });

const initialState: InstitutionDetailState = {
  detail: null,
  detailStatus: "idle",
  detailError: null,
  members: emptyPaged(),
  invitations: emptyPaged(),
  branches: emptyPaged(),
  partners: emptyPaged(),
  services: emptyPaged(),
  contacts: emptyPaged(),
  roles: emptyPaged(),
  permissions: [],
};

const institutionDetailSlice = createSlice({
  name: "institutionDetail",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchInstitutionDetail.pending, (state) => {
        state.detailStatus = "loading";
        state.detailError = null;
      })
      .addCase(fetchInstitutionDetail.fulfilled, (state, action) => {
        state.detailStatus = "idle";
        state.detail = action.payload;
      })
      .addCase(fetchInstitutionDetail.rejected, (state, action) => {
        state.detailStatus = "failed";
        state.detailError = action.error.message ?? "Failed to load institution.";
      })
      .addCase(updateInstitutionStatus.fulfilled, (state, action) => {
        if (state.detail) state.detail.status = action.payload;
      })
      .addCase(updateInstitutionPublished.fulfilled, (state, action) => {
        if (state.detail) state.detail.is_published = action.payload;
      })
      .addCase(updateInstitutionDetail.fulfilled, (state, action) => {
        state.detail = action.payload;
      })
      .addCase(fetchInstitutionMembers.pending, (state) => {
        state.members.status = "loading";
      })
      .addCase(fetchInstitutionMembers.fulfilled, (state, action) => {
        state.members = { items: action.payload.data, total: action.payload.total, status: "idle", error: null };
      })
      .addCase(fetchInstitutionMembers.rejected, (state, action) => {
        state.members.status = "failed";
        state.members.error = action.error.message ?? "Failed to load members.";
      })
      .addCase(fetchInstitutionInvitations.pending, (state) => {
        state.invitations.status = "loading";
      })
      .addCase(fetchInstitutionInvitations.fulfilled, (state, action) => {
        state.invitations = { items: action.payload.data, total: action.payload.total, status: "idle", error: null };
      })
      .addCase(fetchInstitutionInvitations.rejected, (state, action) => {
        state.invitations.status = "failed";
        state.invitations.error = action.error.message ?? "Failed to load invitations.";
      })
      .addCase(cancelInstitutionInvitation.fulfilled, (state, action) => {
        const wasPresent = state.invitations.items.some((i) => i.id === action.payload);
        state.invitations.items = state.invitations.items.filter((i) => i.id !== action.payload);
        if (wasPresent) state.invitations.total = Math.max(0, state.invitations.total - 1);
      })
      .addCase(setInstitutionMemberStatus.fulfilled, (state, action) => {
        const member = state.members.items.find((m) => m.platform_user_id === action.payload.platformUserId);
        if (member) member.account_status = action.payload.accountStatus;
      })
      .addCase(fetchInstitutionRoles.pending, (state) => { state.roles.status = "loading"; })
      .addCase(fetchInstitutionRoles.fulfilled, (state, action) => {
        state.roles = { items: action.payload, total: action.payload.length, status: "idle", error: null };
      })
      .addCase(fetchInstitutionRoles.rejected, (state, action) => {
        state.roles.status = "failed"; state.roles.error = action.error.message ?? "Failed to load roles.";
      })
      .addCase(fetchInstitutionPermissions.fulfilled, (state, action) => { state.permissions = action.payload; })
      .addCase(createInstitutionRole.fulfilled, (state, action) => {
        state.roles.items.push(action.payload); state.roles.total += 1;
      })
      .addCase(updateInstitutionRole.fulfilled, (state, action) => {
        const i = state.roles.items.findIndex((r) => r.id === action.payload.id);
        if (i >= 0) state.roles.items[i] = action.payload;
      })
      .addCase(deleteInstitutionRole.fulfilled, (state, action) => {
        const wasPresent = state.roles.items.some((r) => r.id === action.payload);
        state.roles.items = state.roles.items.filter((r) => r.id !== action.payload);
        if (wasPresent) state.roles.total = Math.max(0, state.roles.total - 1);
      })
      .addCase(fetchInstitutionBranches.pending, (state) => {
        state.branches.status = "loading";
      })
      .addCase(fetchInstitutionBranches.fulfilled, (state, action) => {
        state.branches = { items: action.payload.data, total: action.payload.total, status: "idle", error: null };
      })
      .addCase(fetchInstitutionBranches.rejected, (state, action) => {
        state.branches.status = "failed";
        state.branches.error = action.error.message ?? "Failed to load branches.";
      })
      .addCase(fetchInstitutionPartners.pending, (state) => {
        state.partners.status = "loading";
      })
      .addCase(fetchInstitutionPartners.fulfilled, (state, action) => {
        state.partners = { items: action.payload.data, total: action.payload.total, status: "idle", error: null };
      })
      .addCase(fetchInstitutionPartners.rejected, (state, action) => {
        state.partners.status = "failed";
        state.partners.error = action.error.message ?? "Failed to load partners.";
      })
      .addCase(createInstitutionPartner.fulfilled, (state, action) => {
        state.partners.items.push({ ...action.payload, source: "manual" });
        state.partners.total += 1;
      })
      .addCase(updateInstitutionPartner.fulfilled, (state, action) => {
        const i = state.partners.items.findIndex((p) => p.id === action.payload.id);
        if (i !== -1) state.partners.items[i] = { ...action.payload, source: "manual" };
      })
      .addCase(deleteInstitutionPartner.fulfilled, (state, action) => {
        const wasPresent = state.partners.items.some((p) => p.id === action.payload);
        state.partners.items = state.partners.items.filter((p) => p.id !== action.payload);
        if (wasPresent) state.partners.total = Math.max(0, state.partners.total - 1);
      })
      .addCase(fetchInstitutionServices.pending, (state) => { state.services.status = "loading"; })
      .addCase(fetchInstitutionServices.fulfilled, (state, action) => {
        state.services = { items: action.payload.data, total: action.payload.total, status: "idle", error: null };
      })
      .addCase(fetchInstitutionServices.rejected, (state, action) => {
        state.services.status = "failed";
        state.services.error = action.error.message ?? "Failed to load services.";
      })
      .addCase(createInstitutionService.fulfilled, (state, action) => {
        state.services.items.unshift(action.payload);
        state.services.total += 1;
      })
      .addCase(updateInstitutionService.fulfilled, (state, action) => {
        const i = state.services.items.findIndex((s) => s.id === action.payload.id);
        if (i >= 0) state.services.items[i] = action.payload;
      })
      .addCase(toggleInstitutionServicePublished.fulfilled, (state, action) => {
        const s = state.services.items.find((x) => x.id === action.payload.id);
        if (s) s.is_published = action.payload.is_published;
      })
      .addCase(deleteInstitutionServiceThunk.fulfilled, (state, action) => {
        const wasPresent = state.services.items.some((s) => s.id === action.payload);
        state.services.items = state.services.items.filter((s) => s.id !== action.payload);
        if (wasPresent) state.services.total = Math.max(0, state.services.total - 1);
      })
      .addCase(fetchInstitutionContacts.pending, (state) => { state.contacts.status = "loading"; })
      .addCase(fetchInstitutionContacts.fulfilled, (state, action) => {
        state.contacts = { items: action.payload.data, total: action.payload.total, status: "idle", error: null };
      })
      .addCase(fetchInstitutionContacts.rejected, (state, action) => {
        state.contacts.status = "failed";
        state.contacts.error = action.error.message ?? "Failed to load contacts.";
      })
      .addCase(createInstitutionContact.fulfilled, (state, action) => {
        if (action.payload.is_primary) for (const c of state.contacts.items) c.is_primary = false;
        state.contacts.items.unshift(action.payload);
        state.contacts.total += 1;
      })
      .addCase(updateInstitutionContact.fulfilled, (state, action) => {
        if (action.payload.is_primary) for (const c of state.contacts.items) c.is_primary = false;
        const i = state.contacts.items.findIndex((c) => c.id === action.payload.id);
        if (i >= 0) state.contacts.items[i] = action.payload;
      })
      .addCase(deleteInstitutionContactThunk.fulfilled, (state, action) => {
        const wasPresent = state.contacts.items.some((c) => c.id === action.payload);
        state.contacts.items = state.contacts.items.filter((c) => c.id !== action.payload);
        if (wasPresent) state.contacts.total = Math.max(0, state.contacts.total - 1);
      });
  },
});

export const institutionDetailReducer = institutionDetailSlice.reducer;
