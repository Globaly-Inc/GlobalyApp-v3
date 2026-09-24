import type { ListParams, PaginatedPlatformUsers, PlatformUser, UpdatePlatformUserParams } from "./types";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const FIRST_NAMES = ["Alicia", "Gini", "Marcus", "Priya", "Noah", "Farah", "Diego", "Yuki", "Sam", "Leila", "Owen", "Mei"];
const LAST_NAMES = ["Nguyen", "Patel", "Garcia", "Kim", "Okafor", "Smith", "Rossi", "Tanaka", "Brown", "Haddad"];
const COUNTRIES = ["Nepal", "Afghanistan", "India", "Bangladesh", null];

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
    admin_role: i === 0 ? "super_admin" : null,
    completion_percentage: (i * 13) % 101,
    country: COUNTRIES[i % COUNTRIES.length] ?? null,
  };
});

function matches(search: string | undefined, ...fields: string[]): boolean {
  if (!search) return true;
  const q = search.toLowerCase();
  return fields.some((f) => f.toLowerCase().includes(q));
}

const TYPE_FLAG: Record<NonNullable<ListParams["type"]>, keyof PlatformUser> = {
  personal: "is_personal_account",
  business: "is_business_account",
  institution: "is_institution_account",
};

function matchesType(user: PlatformUser, type: ListParams["type"]): boolean {
  return !type || user[TYPE_FLAG[type]] === true;
}

function paginate<T>(rows: T[], params: ListParams): { data: T[]; meta: PaginatedPlatformUsers["meta"] } {
  const limit = params.limit ?? 10;
  const page = params.page ?? 1;
  const start = (page - 1) * limit;
  return {
    data: rows.slice(start, start + limit),
    meta: { page, limit, total: rows.length, totalPages: Math.max(1, Math.ceil(rows.length / limit)) },
  };
}

export const platformUsersMockApi = {
  listPlatformUsers: async (params: ListParams = {}): Promise<PaginatedPlatformUsers> => {
    console.log("[mock] GET /admin/platform-users", params);
    await delay(300);
    const filtered = mockPlatformUsers
      .filter((u) => matches(params.search, u.first_name, u.last_name, u.email))
      .filter((u) => matchesType(u, params.type))
      .filter((u) => !params.admin || u.admin_role !== null);
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

  setPlatformUserAdminRole: async (id: number, role: "super_admin" | "data_admin" | null): Promise<void> => {
    console.log("[mock] PATCH /admin/platform-users/" + id + "/role", role);
    await delay(300);
    const user = mockPlatformUsers.find((u) => u.id === id);
    if (!user) throw new Error("Platform user not found");
    user.admin_role = role;
  },
};
