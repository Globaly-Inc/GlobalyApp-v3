export function toSlug(name: string, sep: "-" | "_" = "_") {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, sep).replace(new RegExp(`^${sep}|${sep}$`, "g"), "");
}

// Lives in @/lib/utils now that the public course card needs it too — re-exported here so the
// admin call sites keep their existing import path.
export { flagFromIso2 } from "@/lib/utils";
