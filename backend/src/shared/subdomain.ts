export async function generateSubdomain(businessName: string, isTaken: (candidate: string) => Promise<boolean>): Promise<string> {
  const slug = businessName.toLowerCase().replace(/[^a-z0-9]+/g, "-").split("-").filter(Boolean).join("-").slice(0, 20);
  const root = slug.length >= 3 ? slug : "biz";

  if (!(await isTaken(root))) return root;
  for (let attempt = 0; attempt < 20; attempt++) {
    const suffix = `-${Math.floor(1000 + Math.random() * 9000)}`;
    const candidate = `${root.slice(0, 20 - suffix.length)}${suffix}`;
    if (!(await isTaken(candidate))) return candidate;
  }
  throw new Error(`Could not allocate a free subdomain for "${businessName}"`);
}
