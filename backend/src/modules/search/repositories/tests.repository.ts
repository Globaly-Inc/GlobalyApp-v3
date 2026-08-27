import { masterKnex } from "../../../core/db/master-pool.js";

export type PublicTest = {
  id: number;
  name: string;
  slug: string;
  category: "academic" | "language";
  image_url: string | null;
};

/** The whole active catalogue — a short list every course and profile surface reads in one go. */
export function listActiveTests(): Promise<PublicTest[]> {
  return masterKnex("tests")
    .whereNull("deleted_at")
    .where({ is_active: true })
    .orderBy("sort_order")
    .orderBy("name")
    .select("id", "name", "slug", "category", "image_url");
}
