import { Table, TableBody, TableCard, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { RecentSignup } from "../apis/types";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function RecentSignupsSection({ signups }: Readonly<{ signups: RecentSignup[] }>) {
  if (signups.length === 0) return null;
  return (
    <section>
      <h2 className="mb-4 font-heading text-lg font-medium">Recent sign-ups</h2>
      <TableCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="hidden sm:table-cell">Email</TableHead>
              <TableHead numeric>Joined</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {signups.map((u) => (
              <TableRow key={u.id}>
                <TableCell primary>
                  {u.first_name || u.last_name
                    ? [u.first_name, u.last_name].filter(Boolean).join(" ")
                    : <span className="font-normal text-muted-foreground">No name</span>}
                  <span className="block text-xs font-normal text-muted-foreground sm:hidden">{u.email}</span>
                </TableCell>
                <TableCell className="hidden text-muted-foreground sm:table-cell">{u.email}</TableCell>
                <TableCell numeric className="text-muted-foreground">{timeAgo(u.created_at)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableCard>
    </section>
  );
}
