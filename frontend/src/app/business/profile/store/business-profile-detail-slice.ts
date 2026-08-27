// Business-owner-facing counterpart to admin/platform/businesses/store/businesses-slice.ts.


import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { businessProfileDetailApi } from "../apis";
import type {
  ActivityListParams, ActivityLogEntry, Branch, BranchInput, BranchListParams, BranchPatch, BusinessRelation,
  BusinessService, InvitedMember, LinkExistingBranchInput, Member, MemberInviteInput, MemberListParams, MemberPatch, MemberRole,
  Permission, RelationInput, RelationListParams, RelationPatch, Role, RoleCreateInput, RolePatch,
  SchemaFieldValue, Scholarship, ScholarshipInput,
  ScholarshipListParams, ScholarshipPatch, ServiceInput, ServicePatch, ServiceSearchParams,
} from "../apis/types";

// ─── Branches ────────────────────────────────────────────────────────────────
export const fetchBranches = createAsyncThunk(
  "businessProfileDetail/fetchBranches",
  ({ params }: { id: number; params?: BranchListParams }) => businessProfileDetailApi.getBranches(params),
);
export const createBranch = createAsyncThunk(
  "businessProfileDetail/createBranch",
  ({ input }: { id: number; input: BranchInput }) => businessProfileDetailApi.createBranch(input),
);
export const updateBranch = createAsyncThunk(
  "businessProfileDetail/updateBranch",
  ({ branchId, patch }: { id: number; branchId: string; patch: BranchPatch }) => businessProfileDetailApi.updateBranch(branchId, patch),
);
export const linkExistingBranch = createAsyncThunk(
  "businessProfileDetail/linkExistingBranch",
  ({ input }: { id: number; input: LinkExistingBranchInput }) => businessProfileDetailApi.linkExistingBranch(input),
);
export const deleteBranch = createAsyncThunk(
  "businessProfileDetail/deleteBranch",
  async ({ branchId }: { id: number; branchId: string }) => {
    await businessProfileDetailApi.deleteBranch(branchId);
    return branchId;
  },
);

// ─── Services ────────────────────────────────────────────────────────────────
export const fetchServices = createAsyncThunk(
  "businessProfileDetail/fetchServices",
  ({ params }: { id: number; params?: ServiceSearchParams }) => businessProfileDetailApi.searchServices(params),
);
export const createService = createAsyncThunk(
  "businessProfileDetail/createService",
  ({ input }: { id: number; input: ServiceInput }) => businessProfileDetailApi.createService(input),
);
export const updateService = createAsyncThunk(
  "businessProfileDetail/updateService",
  ({ serviceId, patch }: { id: number; serviceId: string; patch: ServicePatch }) => businessProfileDetailApi.updateService(serviceId, patch),
);
export const toggleServicePublished = createAsyncThunk(
  "businessProfileDetail/toggleServicePublished",
  ({ serviceId, is_published }: { id: number; serviceId: string; is_published: boolean }) =>
    businessProfileDetailApi.updateService(serviceId, { is_published }),
);
export const deleteServiceThunk = createAsyncThunk(
  "businessProfileDetail/deleteService",
  async ({ serviceId }: { id: number; serviceId: string }) => {
    await businessProfileDetailApi.deleteService(serviceId);
    return serviceId;
  },
);
export const fetchServiceFieldValues = createAsyncThunk(
  "businessProfileDetail/fetchServiceFieldValues",
  ({ serviceId }: { id: number; serviceId: string }) => businessProfileDetailApi.getServiceFieldValues(serviceId),
);
export const updateServiceFieldValues = createAsyncThunk(
  "businessProfileDetail/updateServiceFieldValues",
  ({ serviceId, values }: { id: number; serviceId: string; values: SchemaFieldValue[] }) =>
    businessProfileDetailApi.updateServiceFieldValues(serviceId, values),
);

// ─── Members ─────────────────────────────────────────────────────────────────
export const fetchMembers = createAsyncThunk(
  "businessProfileDetail/fetchMembers",
  ({ params }: { id: number; params?: MemberListParams }) => businessProfileDetailApi.getMembers(params),
);
export const fetchMemberRoles = createAsyncThunk("businessProfileDetail/fetchMemberRoles", () => businessProfileDetailApi.getMemberRoles());
export const inviteMember = createAsyncThunk(
  "businessProfileDetail/inviteMember",
  ({ input }: { id: number; input: MemberInviteInput }) => businessProfileDetailApi.inviteMember(input),
);
export const updateMember = createAsyncThunk(
  "businessProfileDetail/updateMember",
  ({ memberId, patch }: { id: number; memberId: number; patch: MemberPatch }) => businessProfileDetailApi.updateMember(memberId, patch),
);
export const removeMember = createAsyncThunk(
  "businessProfileDetail/removeMember",
  async ({ memberId }: { id: number; memberId: number }) => {
    await businessProfileDetailApi.removeMember(memberId);
    return memberId;
  },
);
export const fetchInvitations = createAsyncThunk(
  "businessProfileDetail/fetchInvitations",
  ({ params }: { id: number; params?: MemberListParams }) => businessProfileDetailApi.getInvitations(params),
);
export const cancelInvitation = createAsyncThunk(
  "businessProfileDetail/cancelInvitation",
  async ({ invitationId }: { id: number; invitationId: string }) => {
    await businessProfileDetailApi.cancelInvitation(invitationId);
    return invitationId;
  },
);
export const resendInvitation = createAsyncThunk(
  "businessProfileDetail/resendInvitation",
  ({ invitationId }: { id: number; invitationId: string }) => businessProfileDetailApi.resendInvitation(invitationId),
);

// ─── Roles (Members → Roles sub-tab) ─────────────────────────────────────────
// ponytail: orgBase switches the API prefix for institution tokens (/institutions/roles vs /businesses/roles)
function getOrgBase(getState: () => unknown): string {
  const state = getState() as { auth?: { user?: { user_category?: string | null } } };
  return state.auth?.user?.user_category === "institution" ? "/institutions" : "/businesses";
}

export const fetchRoles = createAsyncThunk("businessProfileDetail/fetchRoles", (_: void, { getState }) => businessProfileDetailApi.getRoles(getOrgBase(getState)));
export const fetchPermissions = createAsyncThunk("businessProfileDetail/fetchPermissions", (_: void, { getState }) => businessProfileDetailApi.getPermissions(getOrgBase(getState)));
export const createRole = createAsyncThunk(
  "businessProfileDetail/createRole",
  ({ input }: { input: RoleCreateInput }, { getState }) => businessProfileDetailApi.createRole(input, getOrgBase(getState)),
);
export const updateRole = createAsyncThunk(
  "businessProfileDetail/updateRole",
  ({ roleId, patch }: { roleId: number; patch: RolePatch }, { getState }) => businessProfileDetailApi.updateRole(roleId, patch, getOrgBase(getState)),
);
export const deleteRole = createAsyncThunk(
  "businessProfileDetail/deleteRole",
  async ({ roleId }: { roleId: number }, { getState }) => {
    await businessProfileDetailApi.deleteRole(roleId, getOrgBase(getState));
    return roleId;
  },
);

// ─── Relations (Partners tab) ─────────────────────────────────────────────────
export const fetchRelations = createAsyncThunk(
  "businessProfileDetail/fetchRelations",
  ({ params }: { id: number; params?: RelationListParams }, { getState }) =>
    businessProfileDetailApi.getRelations(params, getOrgBase(getState)),
);
export const createRelation = createAsyncThunk(
  "businessProfileDetail/createRelation",
  ({ input }: { id: number; input: RelationInput }, { getState }) =>
    businessProfileDetailApi.createRelation(input, getOrgBase(getState)),
);
export const updateRelation = createAsyncThunk(
  "businessProfileDetail/updateRelation",
  ({ relationId, patch }: { id: number; relationId: string; patch: RelationPatch }, { getState }) =>
    businessProfileDetailApi.updateRelation(relationId, patch, getOrgBase(getState)),
);
export const deleteRelation = createAsyncThunk(
  "businessProfileDetail/deleteRelation",
  async ({ relationId }: { id: number; relationId: string }, { getState }) => {
    await businessProfileDetailApi.deleteRelation(relationId, getOrgBase(getState));
    return relationId;
  },
);

// ─── Scholarships ────────────────────────────────────────────────────────────
export const fetchScholarships = createAsyncThunk(
  "businessProfileDetail/fetchScholarships",
  ({ params }: { id: number; params?: ScholarshipListParams }) => businessProfileDetailApi.getScholarships(params),
);
export const createScholarship = createAsyncThunk(
  "businessProfileDetail/createScholarship",
  ({ input }: { id: number; input: ScholarshipInput }) => businessProfileDetailApi.createScholarship(input),
);
export const updateScholarship = createAsyncThunk(
  "businessProfileDetail/updateScholarship",
  ({ scholarshipId, patch }: { id: number; scholarshipId: number; patch: ScholarshipPatch }) =>
    businessProfileDetailApi.updateScholarship(scholarshipId, patch),
);
export const toggleScholarshipPublished = createAsyncThunk(
  "businessProfileDetail/toggleScholarshipPublished",
  ({ scholarshipId, is_published }: { id: number; scholarshipId: number; is_published: boolean }) =>
    businessProfileDetailApi.updateScholarship(scholarshipId, { is_published }),
);
export const toggleScholarshipFeatured = createAsyncThunk(
  "businessProfileDetail/toggleScholarshipFeatured",
  ({ scholarshipId, is_featured }: { id: number; scholarshipId: number; is_featured: boolean }) =>
    businessProfileDetailApi.updateScholarship(scholarshipId, { is_featured }),
);
export const deleteScholarship = createAsyncThunk(
  "businessProfileDetail/deleteScholarship",
  async ({ scholarshipId }: { id: number; scholarshipId: number }) => {
    await businessProfileDetailApi.deleteScholarship(scholarshipId);
    return scholarshipId;
  },
);

// ─── Activity ──────────────────────────────────────────────────────────────
export const fetchActivity = createAsyncThunk(
  "businessProfileDetail/fetchActivity",
  ({ params }: { id: number; params?: ActivityListParams }) => businessProfileDetailApi.getActivity(params),
);

type ListState<T> = { items: T[]; status: "idle" | "loading" | "failed"; error: string | null; total: number };

const emptyList = <T,>(): ListState<T> => ({ items: [], status: "idle", error: null, total: 0 });

type BusinessProfileDetailState = {
  branches: ListState<Branch>;
  services: ListState<BusinessService>;
  members: ListState<Member>;
  invitations: ListState<InvitedMember>;
  memberRoles: MemberRole[];
  roles: ListState<Role>;
  permissions: Permission[];
  relations: ListState<BusinessRelation>;
  scholarships: ListState<Scholarship>;
  activity: ListState<ActivityLogEntry>;
};

const initialState: BusinessProfileDetailState = {
  branches: emptyList(), services: emptyList(), members: emptyList(), invitations: emptyList(),
  memberRoles: [], roles: emptyList(), permissions: [], relations: emptyList(), scholarships: emptyList(), activity: emptyList(),
};

const businessProfileDetailSlice = createSlice({
  name: "businessProfileDetail",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchBranches.pending, (state) => { state.branches.status = "loading"; })
      .addCase(fetchBranches.fulfilled, (state, action) => {
        state.branches = { items: action.payload.data, status: "idle", error: null, total: action.payload.total };
      })
      .addCase(fetchBranches.rejected, (state, action) => { state.branches.status = "failed"; state.branches.error = action.error.message ?? "Failed to load branches."; })
      .addCase(createBranch.fulfilled, (state, action) => { state.branches.items.push(action.payload); state.branches.total += 1; })
      .addCase(updateBranch.fulfilled, (state, action) => {
        const i = state.branches.items.findIndex((b) => b.id === action.payload.id);
        if (i !== -1) state.branches.items[i] = action.payload;
      })
      .addCase(linkExistingBranch.fulfilled, (state, action) => { state.branches.items.push(action.payload.branch); state.branches.total += 1; })
      .addCase(deleteBranch.fulfilled, (state, action) => {
        const wasPresent = state.branches.items.some((b) => b.id === action.payload);
        state.branches.items = state.branches.items.filter((b) => b.id !== action.payload);
        if (wasPresent) state.branches.total = Math.max(0, state.branches.total - 1);
      })

      .addCase(fetchServices.pending, (state) => { state.services.status = "loading"; })
      .addCase(fetchServices.fulfilled, (state, action) => {
        state.services = { items: action.payload.data, status: "idle", error: null, total: action.payload.total };
      })
      .addCase(fetchServices.rejected, (state, action) => { state.services.status = "failed"; state.services.error = action.error.message ?? "Failed to load services."; })
      .addCase(createService.fulfilled, (state, action) => { state.services.items.unshift(action.payload); state.services.total += 1; })
      .addCase(updateService.fulfilled, (state, action) => {
        const i = state.services.items.findIndex((s) => s.id === action.payload.id);
        if (i >= 0) state.services.items[i] = action.payload;
      })
      .addCase(toggleServicePublished.fulfilled, (state, action) => {
        const s = state.services.items.find((x) => x.id === action.payload.id);
        if (s) s.is_published = action.payload.is_published;
      })
      .addCase(deleteServiceThunk.fulfilled, (state, action) => {
        const wasPresent = state.services.items.some((s) => s.id === action.payload);
        state.services.items = state.services.items.filter((s) => s.id !== action.payload);
        if (wasPresent) state.services.total = Math.max(0, state.services.total - 1);
      })

      .addCase(fetchMembers.pending, (state) => { state.members.status = "loading"; })
      .addCase(fetchMembers.fulfilled, (state, action) => {
        state.members = { items: action.payload.data, status: "idle", error: null, total: action.payload.total };
      })
      .addCase(fetchMembers.rejected, (state, action) => { state.members.status = "failed"; state.members.error = action.error.message ?? "Failed to load members."; })
      .addCase(fetchMemberRoles.fulfilled, (state, action) => { state.memberRoles = action.payload; })
      .addCase(updateMember.fulfilled, (state, action) => {
        const i = state.members.items.findIndex((m) => m.id === action.payload.id);
        if (i >= 0) state.members.items[i] = action.payload;
      })
      .addCase(removeMember.fulfilled, (state, action) => {
        const wasMember = state.members.items.some((m) => m.id === action.payload);
        state.members.items = state.members.items.filter((m) => m.id !== action.payload);
        if (wasMember) state.members.total = Math.max(0, state.members.total - 1);
      })

      .addCase(fetchInvitations.pending, (state) => { state.invitations.status = "loading"; })
      .addCase(fetchInvitations.fulfilled, (state, action) => {
        state.invitations = { items: action.payload.data, status: "idle", error: null, total: action.payload.total };
      })
      .addCase(fetchInvitations.rejected, (state, action) => { state.invitations.status = "failed"; state.invitations.error = action.error.message ?? "Failed to load invitations."; })
      .addCase(cancelInvitation.fulfilled, (state, action) => {
        const wasPresent = state.invitations.items.some((i) => i.id === action.payload);
        state.invitations.items = state.invitations.items.filter((i) => i.id !== action.payload);
        if (wasPresent) state.invitations.total = Math.max(0, state.invitations.total - 1);
      })

      .addCase(fetchRoles.pending, (state) => { state.roles.status = "loading"; })
      .addCase(fetchRoles.fulfilled, (state, action) => {
        state.roles = { items: action.payload, status: "idle", error: null, total: action.payload.length };
      })
      .addCase(fetchRoles.rejected, (state, action) => { state.roles.status = "failed"; state.roles.error = action.error.message ?? "Failed to load roles."; })
      .addCase(fetchPermissions.fulfilled, (state, action) => { state.permissions = action.payload; })
      .addCase(createRole.fulfilled, (state, action) => { state.roles.items.push(action.payload); state.roles.total += 1; })
      .addCase(updateRole.fulfilled, (state, action) => {
        const i = state.roles.items.findIndex((r) => r.id === action.payload.id);
        if (i >= 0) state.roles.items[i] = action.payload;
      })
      .addCase(deleteRole.fulfilled, (state, action) => {
        const wasPresent = state.roles.items.some((r) => r.id === action.payload);
        state.roles.items = state.roles.items.filter((r) => r.id !== action.payload);
        if (wasPresent) state.roles.total = Math.max(0, state.roles.total - 1);
      })

      .addCase(fetchRelations.pending, (state) => { state.relations.status = "loading"; })
      .addCase(fetchRelations.fulfilled, (state, action) => {
        state.relations = { items: action.payload.data, status: "idle", error: null, total: action.payload.total };
      })
      .addCase(fetchRelations.rejected, (state, action) => { state.relations.status = "failed"; state.relations.error = action.error.message ?? "Failed to load partners."; })
      .addCase(createRelation.fulfilled, (state, action) => { state.relations.items.push(action.payload); state.relations.total += 1; })
      .addCase(updateRelation.fulfilled, (state, action) => {
        const i = state.relations.items.findIndex((r) => r.id === action.payload.id);
        if (i !== -1) state.relations.items[i] = { ...state.relations.items[i], ...action.payload };
      })
      .addCase(deleteRelation.fulfilled, (state, action) => {
        const wasPresent = state.relations.items.some((r) => r.id === action.payload);
        state.relations.items = state.relations.items.filter((r) => r.id !== action.payload);
        if (wasPresent) state.relations.total = Math.max(0, state.relations.total - 1);
      })

      .addCase(fetchScholarships.pending, (state) => { state.scholarships.status = "loading"; })
      .addCase(fetchScholarships.fulfilled, (state, action) => {
        state.scholarships = { items: action.payload.data, status: "idle", error: null, total: action.payload.total };
      })
      .addCase(fetchScholarships.rejected, (state, action) => { state.scholarships.status = "failed"; state.scholarships.error = action.error.message ?? "Failed to load scholarships."; })
      .addCase(createScholarship.fulfilled, (state, action) => { state.scholarships.items.unshift(action.payload); state.scholarships.total += 1; })
      .addCase(updateScholarship.fulfilled, (state, action) => {
        const i = state.scholarships.items.findIndex((s) => s.id === action.payload.id);
        if (i >= 0) state.scholarships.items[i] = action.payload;
      })
      .addCase(toggleScholarshipPublished.fulfilled, (state, action) => {
        const s = state.scholarships.items.find((x) => x.id === action.payload.id);
        if (s) s.is_published = action.payload.is_published;
      })
      .addCase(toggleScholarshipFeatured.fulfilled, (state, action) => {
        const s = state.scholarships.items.find((x) => x.id === action.payload.id);
        if (s) s.is_featured = action.payload.is_featured;
      })
      .addCase(deleteScholarship.fulfilled, (state, action) => {
        const wasPresent = state.scholarships.items.some((s) => s.id === action.payload);
        state.scholarships.items = state.scholarships.items.filter((s) => s.id !== action.payload);
        if (wasPresent) state.scholarships.total = Math.max(0, state.scholarships.total - 1);
      })

      .addCase(fetchActivity.pending, (state) => { state.activity.status = "loading"; })
      .addCase(fetchActivity.fulfilled, (state, action) => {
        state.activity = { items: action.payload.data, status: "idle", error: null, total: action.payload.total };
      })
      .addCase(fetchActivity.rejected, (state, action) => { state.activity.status = "failed"; state.activity.error = action.error.message ?? "Failed to load activity."; });
  },
});

export const businessProfileDetailReducer = businessProfileDetailSlice.reducer;
