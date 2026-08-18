import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { businessesApi } from "../apis";
import type {
  ActivityListParams, ActivityLogEntry, Branch, BranchInput, BranchListParams, BranchPatch, Business, BusinessCreateInput,
  BusinessDetail, BusinessListParams, BusinessPatch, BusinessRelation, BusinessService, BusinessStatus,
  EnquirySettingsPatch, LinkExistingBranchInput, Member, MemberInviteInput, MemberListParams, MemberPatch, MemberRole,
  RelationInput, RelationListParams, RelationPatch,
  SchemaFieldValue, ServiceInput, ServicePatch, ServiceSearchParams,
} from "../apis/types";

export const fetchBusinesses = createAsyncThunk("platformBusinesses/fetch", (params: BusinessListParams) =>
  businessesApi.getBusinesses(params),
);

export const createBusiness = createAsyncThunk("platformBusinesses/create", (input: BusinessCreateInput) =>
  businessesApi.createBusiness(input),
);

export const fetchBusinessDetail = createAsyncThunk("platformBusinesses/fetchDetail", (id: number) =>
  businessesApi.getBusinessDetail(id),
);

export const updateBusinessDetail = createAsyncThunk(
  "platformBusinesses/updateDetail",
  ({ id, patch }: { id: number; patch: BusinessPatch }) => businessesApi.updateBusiness(id, patch),
);

export const updateEnquirySettings = createAsyncThunk(
  "platformBusinesses/updateEnquirySettings",
  ({ id, patch }: { id: number; patch: EnquirySettingsPatch }) => businessesApi.updateEnquirySettings(id, patch),
);

export const updateBusinessStatus = createAsyncThunk(
  "platformBusinesses/updateStatus",
  async ({ id, status }: { id: number; status: BusinessStatus }) => {
    await businessesApi.updateStatus(id, status);
    return { id, status };
  },
);

export const sendClaimRequest = createAsyncThunk("platformBusinesses/sendClaimRequest", async (id: number) => {
  await businessesApi.sendClaimRequest(id);
  return { id, claim_status: "claim_pending" as const };
});

export const sendBulkClaimRequests = createAsyncThunk("platformBusinesses/sendBulkClaimRequests", async (ids: number[]) => {
  await businessesApi.sendBulkClaimRequests(ids);
  return { ids, claim_status: "claim_pending" as const };
});

export const updateBusinessPublished = createAsyncThunk(
  "platformBusinesses/updatePublished",
  async ({ id, is_published }: { id: number; is_published: boolean }) => {
    await businessesApi.updatePublished(id, is_published);
    return { id, is_published };
  },
);

export const deleteBusinessThunk = createAsyncThunk("platformBusinesses/delete", async (id: number) => {
  await businessesApi.deleteBusiness(id);
  return id;
});

// ─── Branches ────────────────────────────────────────────────────────────────
export const fetchBranches = createAsyncThunk(
  "platformBusinesses/fetchBranches",
  ({ id, params }: { id: number; params?: BranchListParams }) => businessesApi.getBranches(id, params),
);
export const createBranch = createAsyncThunk(
  "platformBusinesses/createBranch",
  ({ id, input }: { id: number; input: BranchInput }) => businessesApi.createBranch(id, input),
);
export const updateBranch = createAsyncThunk(
  "platformBusinesses/updateBranch",
  ({ id, branchId, patch }: { id: number; branchId: string; patch: BranchPatch }) => businessesApi.updateBranch(id, branchId, patch),
);
export const linkExistingBranch = createAsyncThunk(
  "platformBusinesses/linkExistingBranch",
  ({ id, input }: { id: number; input: LinkExistingBranchInput }) => businessesApi.linkExistingBranch(id, input),
);
export const deleteBranch = createAsyncThunk(
  "platformBusinesses/deleteBranch",
  async ({ id, branchId }: { id: number; branchId: string }) => {
    await businessesApi.deleteBranch(id, branchId);
    return branchId;
  },
);

// ─── Services ────────────────────────────────────────────────────────────────
export const fetchServices = createAsyncThunk(
  "platformBusinesses/fetchServices",
  ({ id, params }: { id: number; params?: ServiceSearchParams }) => businessesApi.searchServices(id, params),
);
export const createService = createAsyncThunk(
  "platformBusinesses/createService",
  ({ id, input }: { id: number; input: ServiceInput }) => businessesApi.createService(id, input),
);
export const updateService = createAsyncThunk(
  "platformBusinesses/updateService",
  ({ id, serviceId, patch }: { id: number; serviceId: string; patch: ServicePatch }) =>
    businessesApi.updateService(id, serviceId, patch),
);
export const fetchServiceFieldValues = createAsyncThunk(
  "platformBusinesses/fetchServiceFieldValues",
  ({ id, serviceId }: { id: number; serviceId: string }) => businessesApi.getServiceFieldValues(id, serviceId),
);
export const updateServiceFieldValues = createAsyncThunk(
  "platformBusinesses/updateServiceFieldValues",
  ({ id, serviceId, values }: { id: number; serviceId: string; values: SchemaFieldValue[] }) =>
    businessesApi.updateServiceFieldValues(id, serviceId, values),
);
export const toggleServicePublished = createAsyncThunk(
  "platformBusinesses/toggleServicePublished",
  ({ id, serviceId, is_published }: { id: number; serviceId: string; is_published: boolean }) =>
    businessesApi.setServicePublished(id, serviceId, is_published),
);
export const deleteServiceThunk = createAsyncThunk(
  "platformBusinesses/deleteService",
  async ({ id, serviceId }: { id: number; serviceId: string }) => {
    await businessesApi.deleteService(id, serviceId);
    return serviceId;
  },
);

// ─── Members (invite → platform_users → agents once accepted) ────────────────
export const fetchMembers = createAsyncThunk(
  "platformBusinesses/fetchMembers",
  ({ id, params }: { id: number; params?: MemberListParams }) => businessesApi.getMembers(id, params),
);
export const fetchContacts = createAsyncThunk(
  "platformBusinesses/fetchContacts",
  ({ id, params }: { id: number; params?: Omit<MemberListParams, "point_of_contact"> }) =>
    businessesApi.getMembers(id, { ...params, point_of_contact: true }),
);
export const fetchMemberRoles = createAsyncThunk("platformBusinesses/fetchMemberRoles", (id: number) => businessesApi.getMemberRoles(id));
export const inviteMember = createAsyncThunk(
  "platformBusinesses/inviteMember",
  ({ id, input }: { id: number; input: MemberInviteInput }) => businessesApi.inviteMember(id, input),
);
export const updateMember = createAsyncThunk(
  "platformBusinesses/updateMember",
  ({ id, memberId, patch }: { id: number; memberId: number; patch: MemberPatch }) =>
    businessesApi.updateMember(id, memberId, patch),
);
export const removeMember = createAsyncThunk(
  "platformBusinesses/removeMember",
  async ({ id, memberId }: { id: number; memberId: number }) => {
    await businessesApi.removeMember(id, memberId);
    return memberId;
  },
);

// ─── Relations (subsidiary/franchise/partner — Branches tab) ─────────────────
export const fetchRelations = createAsyncThunk(
  "platformBusinesses/fetchRelations",
  ({ id, params }: { id: number; params?: RelationListParams }) => businessesApi.getRelations(id, params),
);
export const createRelation = createAsyncThunk(
  "platformBusinesses/createRelation",
  ({ id, input }: { id: number; input: RelationInput }) => businessesApi.createRelation(id, input),
);
export const updateRelation = createAsyncThunk(
  "platformBusinesses/updateRelation",
  ({ id, relationId, patch }: { id: number; relationId: string; patch: RelationPatch }) =>
    businessesApi.updateRelation(id, relationId, patch),
);
export const deleteRelation = createAsyncThunk(
  "platformBusinesses/deleteRelation",
  async ({ id, relationId }: { id: number; relationId: string }) => {
    await businessesApi.deleteRelation(id, relationId);
    return relationId;
  },
);

// ─── Activity ────────────────────────────────────────────────────────────────
export const fetchActivity = createAsyncThunk(
  "platformBusinesses/fetchActivity",
  ({ id, params }: { id: number; params?: ActivityListParams }) => businessesApi.getActivity(id, params),
);

type RelationsState<T> = { items: T[]; status: "idle" | "loading" | "failed"; error: string | null };

const emptyRelation = <T,>(): RelationsState<T> => ({ items: [], status: "idle", error: null });

type BranchesState = RelationsState<Branch> & { total: number };

const emptyBranches = (): BranchesState => ({ ...emptyRelation<Branch>(), total: 0 });

type PartnersState = RelationsState<BusinessRelation> & { total: number };

const emptyPartners = (): PartnersState => ({ ...emptyRelation<BusinessRelation>(), total: 0 });

type BusinessesState = {
  businesses: Business[];
  status: "idle" | "loading" | "failed";
  error: string | null;
  detail: BusinessDetail | null;
  detailStatus: "idle" | "loading" | "failed";
  detailError: string | null;
  branches: BranchesState;
  services: RelationsState<BusinessService> & { total: number };
  members: RelationsState<Member> & { total: number };
  contacts: RelationsState<Member> & { total: number };
  memberRoles: MemberRole[];
  relations: PartnersState;
  activity: RelationsState<ActivityLogEntry> & { total: number };
};

const emptyPaged = <T,>() => ({ ...emptyRelation<T>(), total: 0 });

const initialState: BusinessesState = {
  businesses: [], status: "idle", error: null,
  detail: null, detailStatus: "idle", detailError: null,
  branches: emptyBranches(), services: emptyPaged(), members: emptyPaged(), contacts: emptyPaged(),
  memberRoles: [], relations: emptyPartners(), activity: emptyPaged(),
};

const businessesSlice = createSlice({
  name: "platformBusinesses",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchBusinesses.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchBusinesses.fulfilled, (state, action) => {
        state.status = "idle";
        state.businesses = action.payload;
      })
      .addCase(fetchBusinesses.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message ?? "Failed to load businesses.";
      })
      .addCase(createBusiness.fulfilled, (state, action) => {
        state.businesses.unshift(action.payload);
      })
      .addCase(updateBusinessStatus.fulfilled, (state, action) => {
        const b = state.businesses.find((x) => x.id === action.payload.id);
        if (b) b.status = action.payload.status;
        if (state.detail?.id === action.payload.id) state.detail.status = action.payload.status;
      })
      .addCase(sendClaimRequest.fulfilled, (state, action) => {
        const b = state.businesses.find((x) => x.id === action.payload.id);
        if (b) b.claim_status = action.payload.claim_status;
        if (state.detail?.id === action.payload.id) state.detail.claim_status = action.payload.claim_status;
      })
      .addCase(sendBulkClaimRequests.fulfilled, (state, action) => {
        const ids = new Set(action.payload.ids);
        state.businesses.forEach((b) => {
          if (ids.has(b.id)) b.claim_status = action.payload.claim_status;
        });
        if (state.detail && ids.has(state.detail.id)) state.detail.claim_status = action.payload.claim_status;
      })
      .addCase(updateBusinessPublished.fulfilled, (state, action) => {
        const b = state.businesses.find((x) => x.id === action.payload.id);
        if (b) b.is_published = action.payload.is_published;
        if (state.detail?.id === action.payload.id) state.detail.is_published = action.payload.is_published;
      })
      .addCase(deleteBusinessThunk.fulfilled, (state, action) => {
        state.businesses = state.businesses.filter((x) => x.id !== action.payload);
      })
      .addCase(fetchBusinessDetail.pending, (state) => {
        state.detailStatus = "loading";
        state.detailError = null;
        state.branches = emptyBranches();
        state.services = emptyPaged();
        state.members = emptyPaged();
        state.contacts = emptyPaged();
        state.relations = emptyPartners();
        state.activity = emptyPaged();
      })
      .addCase(fetchBusinessDetail.fulfilled, (state, action) => {
        state.detailStatus = "idle";
        state.detail = action.payload;
      })
      .addCase(fetchBusinessDetail.rejected, (state, action) => {
        state.detailStatus = "failed";
        state.detailError = action.error.message ?? "Failed to load business.";
      })
      .addCase(updateBusinessDetail.fulfilled, (state, action) => {
        state.detail = action.payload;
      })
      .addCase(updateEnquirySettings.fulfilled, (state, action) => {
        state.detail = action.payload;
      })

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
      .addCase(fetchContacts.pending, (state) => { state.contacts.status = "loading"; })
      .addCase(fetchContacts.fulfilled, (state, action) => {
        state.contacts = { items: action.payload.data, status: "idle", error: null, total: action.payload.total };
      })
      .addCase(fetchContacts.rejected, (state, action) => { state.contacts.status = "failed"; state.contacts.error = action.error.message ?? "Failed to load contacts."; })
      .addCase(fetchMemberRoles.fulfilled, (state, action) => { state.memberRoles = action.payload; })
      .addCase(updateMember.fulfilled, (state, action) => {
        const i = state.members.items.findIndex((m) => m.id === action.payload.id);
        if (i >= 0) state.members.items[i] = action.payload;
        const j = state.contacts.items.findIndex((m) => m.id === action.payload.id);
        if (action.payload.admin_point_of_contact) {
          if (j >= 0) state.contacts.items[j] = action.payload;
          else { state.contacts.items.push(action.payload); state.contacts.total += 1; }
        } else if (j >= 0) {
          state.contacts.items.splice(j, 1);
          state.contacts.total = Math.max(0, state.contacts.total - 1);
        }
      })
      .addCase(removeMember.fulfilled, (state, action) => {
        const wasMember = state.members.items.some((m) => m.id === action.payload);
        const wasContact = state.contacts.items.some((m) => m.id === action.payload);
        state.members.items = state.members.items.filter((m) => m.id !== action.payload);
        state.contacts.items = state.contacts.items.filter((m) => m.id !== action.payload);
        if (wasMember) state.members.total = Math.max(0, state.members.total - 1);
        if (wasContact) state.contacts.total = Math.max(0, state.contacts.total - 1);
      })

      .addCase(fetchRelations.pending, (state) => { state.relations.status = "loading"; })
      .addCase(fetchRelations.fulfilled, (state, action) => {
        state.relations = { items: action.payload.data, status: "idle", error: null, total: action.payload.total };
      })
      .addCase(fetchRelations.rejected, (state, action) => { state.relations.status = "failed"; state.relations.error = action.error.message ?? "Failed to load relations."; })
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

export const businessesReducer = businessesSlice.reducer;
