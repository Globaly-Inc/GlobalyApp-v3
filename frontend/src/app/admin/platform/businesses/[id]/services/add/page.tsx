import { ServiceFormView } from "../../../components/service-form-view";

export default async function AdminAddServicePage({ params }: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params;
  return <ServiceFormView businessId={Number(id)} />;
}
