import { uuid } from "@/lib/utils";
import type {
  AdminInvitation, AdminUser, InviteAdminParams, ListParams, PaginatedAdminUsers, PaginatedInvitations,
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
    role: ROLES[i % ROLES.length] ?? "admin",
    photo_url: null,
    account_status: i % 7 === 0 ? 0 : 1,
    is_email_verified: i % 5 !== 0,
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

  listInvitations: async (params: ListParams = {}): Promise<PaginatedInvitations> => {
    console.log("[mock] GET /admin/users/invitations", params);
    await delay(300);
    const filtered = mockInvitations.filter((i) => matches(params.search, i.first_name, i.last_name, i.email));
    return paginate(filtered, params);
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
