import { ServiceFormView } from "@/app/business/profile/components/services/service-form-view";

export default async function BusinessAddServicePage({ params }: Readonly<{ params: Promise<{ businessId: string }> }>) {
  const { businessId } = await params;
  return <ServiceFormView businessId={Number(businessId)} />;
}
