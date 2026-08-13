import { redirect } from "next/navigation";

// /personal was the portal's Home page until commit e694e14 moved that surface to /personal/portal and
// deleted this file, leaving the bare section root a 404. Everything else under /personal/* still works, so
// the only thing missing was somewhere for the parent path to go.
export default function PersonalPage() {
  redirect("/personal/portal");
}
