import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { businessesApi } from "../apis";
import type {
  BusinessStatus, InstitutionBranch, InstitutionBranchListParams, InstitutionCourse, InstitutionCourseListParams, InstitutionDetail, InstitutionInvitation,
  InstitutionInvitationListParams, InstitutionInviteInput, InstitutionPartner, InstitutionPatch, InstitutionPermission, InstitutionRole,
  InstitutionRoleCreateInput, InstitutionRolePatch, Member, MemberListParams,
} from "../apis/types";

// Separate from businesses-slice.ts: institutions have no real contacts/activity/enquiry-settings
// backend yet. Branches/Partners here aren't a real CRUD either — they're read-only projections
// of the source extraction job's campuses/agents (see businesses.service.ts on the backend).

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

export const fetchInstitutionCourses = createAsyncThunk(
  "institutionDetail/fetchCourses",
  ({ id, params }: { id: number; params?: InstitutionCourseListParams }) => businessesApi.getInstitutionCourses(id, params),
);

export const fetchInstitutionBranches = createAsyncThunk(
  "institutionDetail/fetchBranches",
  ({ id, params }: { id: number; params?: InstitutionBranchListParams }) => businessesApi.getInstitutionBranches(id, params),
);

export const fetchInstitutionPartners = createAsyncThunk("institutionDetail/fetchPartners", (id: number) =>
  businessesApi.getInstitutionPartners(id),
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
  courses: PagedState<InstitutionCourse>;
  invitations: PagedState<InstitutionInvitation>;
  branches: PagedState<InstitutionBranch>;
  partners: PagedState<InstitutionPartner>;
  roles: PagedState<InstitutionRole>;
  permissions: InstitutionPermission[];
};

const emptyPaged = <T,>(): PagedState<T> => ({ items: [], total: 0, status: "idle", error: null });

const initialState: InstitutionDetailState = {
  detail: null,
  detailStatus: "idle",
  detailError: null,
  members: emptyPaged(),
  courses: emptyPaged(),
  invitations: emptyPaged(),
  branches: emptyPaged(),
  partners: emptyPaged(),
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
      .addCase(fetchInstitutionCourses.pending, (state) => {
        state.courses.status = "loading";
      })
      .addCase(fetchInstitutionCourses.fulfilled, (state, action) => {
        state.courses = { items: action.payload.data, total: action.payload.total, status: "idle", error: null };
      })
      .addCase(fetchInstitutionCourses.rejected, (state, action) => {
        state.courses.status = "failed";
        state.courses.error = action.error.message ?? "Failed to load courses.";
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
        state.partners = { items: action.payload, total: action.payload.length, status: "idle", error: null };
      })
      .addCase(fetchInstitutionPartners.rejected, (state, action) => {
        state.partners.status = "failed";
        state.partners.error = action.error.message ?? "Failed to load partners.";
      });
  },
});

export const institutionDetailReducer = institutionDetailSlice.reducer;
