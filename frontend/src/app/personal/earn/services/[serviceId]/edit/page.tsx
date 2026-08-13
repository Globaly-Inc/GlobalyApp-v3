import { notFound } from "next/navigation";
import { ListingFormView } from "../../components/listing-form-view";

export default async function EditServicePage({ params }: Readonly<{ params: Promise<{ serviceId: string }> }>) {
  const { serviceId } = await params;
  const id = Number(serviceId);
  // A non-numeric id can never match a listing, so fail here rather than sending the API a junk request.
  if (!Number.isInteger(id) || id <= 0) notFound();
  return <ListingFormView serviceId={id} />;
}
