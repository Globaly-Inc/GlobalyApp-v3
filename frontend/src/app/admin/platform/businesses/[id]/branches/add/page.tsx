import { AdminBranchForm } from "@/app/admin/platform/businesses/components/branches/admin-branch-form";

export default async function AdminAddBranchPage({ params }: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params;
  return <AdminBranchForm kind="business" orgId={Number(id)} />;
}
