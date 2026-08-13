import { ListingFormView } from "../components/listing-form-view";

// Matched before [serviceId] by the App Router, so "new" is never read as a service id.
export default function NewServicePage() {
  return <ListingFormView />;
}
