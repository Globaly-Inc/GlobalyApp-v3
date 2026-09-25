import { BranchFormView } from "@/app/business/profile/components/branches/branch-form-view";

export default async function BusinessEditBranchPage({
  params,
}: Readonly<{ params: Promise<{ businessId: string; branchId: string }> }>) {
  const { businessId, branchId } = await params;
  return <BranchFormView businessId={Number(businessId)} branchId={branchId} />;
}
