import { AdminNotAvailableView } from "../../../components/admin-not-available-view";

export function ModerationView() {
  return (
    <AdminNotAvailableView
      title="Moderation"
      description="Manage suspended accounts and content flags."
      wave="G"
      waveScope="Wave G builds the moderation queue (G1: discover — publishing and moderation)."
    />
  );
}
