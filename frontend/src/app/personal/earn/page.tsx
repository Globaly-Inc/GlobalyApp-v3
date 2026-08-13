import { redirect } from "next/navigation";

// Opening Earn lands on the only feature that exists. The source PRD's landing state resolves by what the
// user has (listings → My Services, else an ambassador application → Ambassador, …), but two of its three
// paths are unbuilt, so resolving between them would be theatre.
export default function EarnPage() {
  redirect("/personal/earn/services");
}
