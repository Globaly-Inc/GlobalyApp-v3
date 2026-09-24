import type { AdminUser } from "./types";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const mockMe: AdminUser = {
  id: 1,
  platform_user_id: 1,
  uuid: "mock-admin-uuid",
  name: "Super Admin",
  email: "admin@example.com",
  phone: null,
  role: "super_admin",
  photo_url: null,
  cover_url: null,
  account_status: 1,
  is_email_verified: true,
  is_active: true,
  created_at: new Date(Date.now() - 30 * 86_400_000).toISOString(),
};

export const adminMockApi = {
  getMe: async (): Promise<AdminUser> => {
    console.log("[mock] GET /admin/me");
    await delay(300);
    return mockMe;
  },

  updateMe: async (id: number, patch: Partial<Pick<AdminUser, "name">>): Promise<AdminUser> => {
    console.log("[mock] PATCH /admin/users/" + id, patch);
    await delay(300);
    Object.assign(mockMe, patch);
    return mockMe;
  },

  uploadImage: async (category: "profile" | "cover", file: File): Promise<{ storage_path: string }> => {
    console.log("[mock] POST /platform-users/me/files?category=" + category, file.name);
    await delay(300);
    const url = URL.createObjectURL(file);
    if (category === "profile") mockMe.photo_url = url;
    else mockMe.cover_url = url;
    return { storage_path: url };
  },
};
