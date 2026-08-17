import { AdminNotAvailableView } from "../../../components/admin-not-available-view";

export function EventsView() {
  return (
    <AdminNotAvailableView
      title="Events"
      description="Events management — searchable list of platform events."
      wave="D"
      waveScope="Wave D builds the events backend (D3: events and notifications)."
    />
  );
}
