import { BranchFormView } from "@/app/business/profile/components/branches/branch-form-view";

export default async function BusinessAddBranchPage({ params }: Readonly<{ params: Promise<{ businessId: string }> }>) {
  const { businessId } = await params;
  return <BranchFormView businessId={Number(businessId)} />;
}
