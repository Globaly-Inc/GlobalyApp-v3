import { uuid } from "@/lib/utils";
import type {
  AdminInvitation, AdminUser, InviteAdminParams, ListParams, PaginatedAdminUsers, PaginatedInvitations,
  PaginatedPlatformUsers, PlatformUser, UpdateAdminParams, UpdatePlatformUserParams,
} from "./types";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const FIRST_NAMES = ["Alicia", "Gini", "Marcus", "Priya", "Noah", "Farah", "Diego", "Yuki", "Sam", "Leila", "Owen", "Mei"];
const LAST_NAMES = ["Nguyen", "Patel", "Garcia", "Kim", "Okafor", "Smith", "Rossi", "Tanaka", "Brown", "Haddad"];
const ROLES: AdminUser["role"][] = ["super_admin", "admin", "data_admin", "moderator"];

const mockAdminUsers: AdminUser[] = Array.from({ length: 14 }, (_, i) => {
  const first = FIRST_NAMES[i % FIRST_NAMES.length] ?? "User";
  const last = LAST_NAMES[i % LAST_NAMES.length] ?? "Account";
  return {
    id: i + 1,
    uuid: uuid(),
    name: `${first} ${last}`,
    email: `${first.toLowerCase()}.${last.toLowerCase()}@example.com`,
    phone: null,
    role: ROLES[i % ROLES.length] ?? "admin",
    photo_url: null,
    cover_url: null,
    account_status: i % 7 === 0 ? 0 : 1,
    is_email_verified: i % 5 !== 0,
    is_active: i % 6 !== 0,
    created_at: new Date(Date.now() - (i + 1) * 4 * 86_400_000).toISOString(),
  };
});

let mockInvitations: AdminInvitation[] = [
  {
    id: uuid(), email: "new.admin@example.com", first_name: "Jordan", last_name: "Lee",
    role: "admin", status: "pending", invited_by: 1,
    created_at: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    expired_at: new Date(Date.now() + 1 * 86_400_000).toISOString(),
  },
  {
    id: uuid(), email: "data.reviewer@example.com", first_name: "Casey", last_name: "Nguyen",
    role: "data_admin", status: "pending", invited_by: 1,
    created_at: new Date(Date.now() - 5 * 86_400_000).toISOString(),
    expired_at: new Date(Date.now() - 2 * 86_400_000).toISOString(),
  },
  {
    id: uuid(), email: "moderator@example.com", first_name: "Riley", last_name: "Kim",
    role: "moderator", status: "accepted", invited_by: 1,
    created_at: new Date(Date.now() - 10 * 86_400_000).toISOString(),
    expired_at: new Date(Date.now() - 7 * 86_400_000).toISOString(),
  },
];

const mockPlatformUsers: PlatformUser[] = Array.from({ length: 22 }, (_, i) => {
  const first = FIRST_NAMES[i % FIRST_NAMES.length] ?? "User";
  const last = LAST_NAMES[i % LAST_NAMES.length] ?? "Account";
  const bucket = i % 3;
  return {
    id: i + 1,
    first_name: first,
    last_name: last,
    email: `${first.toLowerCase()}.${last.toLowerCase()}${i}@example.com`,
    phone: null,
    account_status: i % 9 === 0 ? 0 : 1,
    is_email_verified: i % 4 !== 0,
    is_personal_account: bucket === 0,
    is_business_account: bucket === 1,
    is_institution_account: bucket === 2,
    created_at: new Date(Date.now() - (i + 1) * 3 * 86_400_000).toISOString(),
  };
});

function matches(search: string | undefined, ...fields: string[]): boolean {
  if (!search) return true;
  const q = search.toLowerCase();
  return fields.some((f) => f.toLowerCase().includes(q));
}

function paginate<T>(rows: T[], params: ListParams): { data: T[]; meta: PaginatedAdminUsers["meta"] } {
  const limit = params.limit ?? 10;
  const page = params.page ?? 1;
  const start = (page - 1) * limit;
  return {
    data: rows.slice(start, start + limit),
    meta: { page, limit, total: rows.length, totalPages: Math.max(1, Math.ceil(rows.length / limit)) },
  };
}

export const usersMockApi = {
  listUsers: async (params: ListParams = {}): Promise<PaginatedAdminUsers> => {
    console.log("[mock] GET /admin/users", params);
    await delay(300);
    const filtered = mockAdminUsers.filter((u) => matches(params.search, u.name, u.email));
    return paginate(filtered, params);
  },

  listPlatformUsers: async (params: ListParams = {}): Promise<PaginatedPlatformUsers> => {
    console.log("[mock] GET /admin/platform-users", params);
    await delay(300);
    const filtered = mockPlatformUsers.filter((u) => matches(params.search, u.first_name, u.last_name, u.email));
    return paginate(filtered, params);
  },

  updatePlatformUser: async (id: number, patch: UpdatePlatformUserParams): Promise<PlatformUser> => {
    console.log("[mock] PATCH /admin/platform-users/" + id, patch);
    await delay(300);
    const user = mockPlatformUsers.find((u) => u.id === id);
    if (!user) throw new Error("Platform user not found");
    Object.assign(user, patch);
    return user;
  },

  listInvitations: async (params: ListParams = {}): Promise<PaginatedInvitations> => {
    console.log("[mock] GET /admin/users/invitations", params);
    await delay(300);
    const filtered = mockInvitations
      .filter((i) => i.status === "pending")
      .filter((i) => matches(params.search, i.first_name, i.last_name, i.email));
    return paginate(filtered, params);
  },

  resendInvitation: async (id: string): Promise<void> => {
    console.log("[mock] POST /admin/users/invitations/:id/resend", id);
    await delay(300);
    const invitation = mockInvitations.find((i) => i.id === id);
    if (!invitation) throw new Error("Invitation not found");
    invitation.expired_at = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
  },

  updateAdmin: async (id: number, patch: UpdateAdminParams): Promise<void> => {
    console.log("[mock] PATCH /admin/users/" + id, patch);
    await delay(300);
    const user = mockAdminUsers.find((u) => u.id === id);
    if (!user) throw new Error("Admin not found");
    Object.assign(user, patch);
  },

  inviteAdmin: async (params: InviteAdminParams): Promise<void> => {
    console.log("[mock] POST /admin/users/invite", params);
    await delay(300);
    mockInvitations = [
      {
        id: uuid(), email: params.email, first_name: params.first_name, last_name: params.last_name,
        role: params.role, status: "pending", invited_by: 1,
        created_at: new Date().toISOString(),
        expired_at: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
      },
      ...mockInvitations,
    ];
  },
};
