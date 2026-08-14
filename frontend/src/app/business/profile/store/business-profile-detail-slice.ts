// Business-owner-facing counterpart to admin/platform/businesses/store/businesses-slice.ts.
// Thunks keep the same `{ id, ... }` argument shape as the admin slice (id is unused here — the
// backend infers the business from the caller's JWT org) so tab components port over with only
// an import-path change, not a call-site rewrite.

import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { businessProfileDetailApi } from "../apis";
import type {
  ActivityListParams, ActivityLogEntry, Branch, BranchInput, BranchListParams, BranchPatch, BusinessRelation,
  BusinessService, LinkExistingBranchInput, Member, MemberInviteInput, MemberListParams, MemberPatch, MemberRole,
  RelationInput, RelationListParams, RelationPatch, SchemaFieldValue, ServiceInput, ServicePatch, ServiceSearchParams,
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

// ─── Relations (Partners tab) ─────────────────────────────────────────────────
export const fetchRelations = createAsyncThunk(
  "businessProfileDetail/fetchRelations",
  ({ params }: { id: number; params?: RelationListParams }) => businessProfileDetailApi.getRelations(params),
);
export const createRelation = createAsyncThunk(
  "businessProfileDetail/createRelation",
  ({ input }: { id: number; input: RelationInput }) => businessProfileDetailApi.createRelation(input),
);
export const updateRelation = createAsyncThunk(
  "businessProfileDetail/updateRelation",
  ({ relationId, patch }: { id: number; relationId: string; patch: RelationPatch }) => businessProfileDetailApi.updateRelation(relationId, patch),
);
export const deleteRelation = createAsyncThunk(
  "businessProfileDetail/deleteRelation",
  async ({ relationId }: { id: number; relationId: string }) => {
    await businessProfileDetailApi.deleteRelation(relationId);
    return relationId;
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
  memberRoles: MemberRole[];
  relations: ListState<BusinessRelation>;
  activity: ListState<ActivityLogEntry>;
};

const initialState: BusinessProfileDetailState = {
  branches: emptyList(), services: emptyList(), members: emptyList(),
  memberRoles: [], relations: emptyList(), activity: emptyList(),
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

      .addCase(fetchActivity.pending, (state) => { state.activity.status = "loading"; })
      .addCase(fetchActivity.fulfilled, (state, action) => {
        state.activity = { items: action.payload.data, status: "idle", error: null, total: action.payload.total };
      })
      .addCase(fetchActivity.rejected, (state, action) => { state.activity.status = "failed"; state.activity.error = action.error.message ?? "Failed to load activity."; });
  },
});

export const businessProfileDetailReducer = businessProfileDetailSlice.reducer;
