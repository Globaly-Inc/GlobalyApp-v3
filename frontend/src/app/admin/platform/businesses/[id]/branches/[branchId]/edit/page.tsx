import { AdminBranchForm } from "@/app/admin/platform/businesses/components/branches/admin-branch-form";

export default async function AdminEditBranchPage({ params }: Readonly<{ params: Promise<{ id: string; branchId: string }> }>) {
  const { id, branchId } = await params;
  return <AdminBranchForm kind="business" orgId={Number(id)} branchId={branchId} />;
}
