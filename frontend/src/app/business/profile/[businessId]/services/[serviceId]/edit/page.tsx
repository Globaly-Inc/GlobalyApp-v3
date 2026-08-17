import { ServiceFormView } from "@/app/business/profile/components/services/service-form-view";

export default async function BusinessEditServicePage({
  params,
}: Readonly<{ params: Promise<{ businessId: string; serviceId: string }> }>) {
  const { businessId, serviceId } = await params;
  return <ServiceFormView businessId={Number(businessId)} serviceId={serviceId} />;
}
