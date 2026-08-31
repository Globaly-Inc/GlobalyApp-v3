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
    <div className="mt-6">
      <h2 className="text-xl font-semibold mb-4">Recent sign-ups</h2>
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">Name</th>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">Email</th>
              <th className="px-4 py-2 text-right font-medium text-muted-foreground">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {signups.map((u) => (
              <tr key={u.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-4 py-2.5 font-medium">
                  {u.first_name || u.last_name
                    ? [u.first_name, u.last_name].filter(Boolean).join(" ")
                    : <span className="text-muted-foreground italic">No name</span>}
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">{u.email}</td>
                <td className="px-4 py-2.5 text-right text-muted-foreground">{timeAgo(u.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
