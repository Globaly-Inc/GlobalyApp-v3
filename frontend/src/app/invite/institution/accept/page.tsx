import { ClaimAcceptView } from "@/app/invite/claim-accept-view";

// The URL the institution claim email points at — see institution-claim.service.ts's claimUrl.
export default function InstitutionClaimAcceptPage() {
  return <ClaimAcceptView kind="institution" />;
}
