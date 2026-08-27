import { BadgeCheck, Ban, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAppDispatch } from "@/lib/hooks";
import { fetchPlatformUsers, updatePlatformUser } from "../store/users-slice";
import type { PlatformUser } from "../apis/types";

const CATEGORY_LABELS: { key: keyof PlatformUser; label: string }[] = [
  { key: "is_personal_account", label: "Personal" },
  { key: "is_business_account", label: "Business" },
  { key: "is_institution_account", label: "Institution" },
];

export function PlatformUserRow({
  user, onSuspend,
}: Readonly<{ user: PlatformUser; onSuspend: () => void }>) {
  const dispatch = useAppDispatch();
  const initial = (user.first_name?.[0] ?? user.email[0] ?? "U").toUpperCase();
  const categories = CATEGORY_LABELS.filter((c) => user[c.key]);
  const active = user.account_status !== 0;

  const handleVerifyEmail = async () => {
    const result = await dispatch(updatePlatformUser({ id: user.id, patch: { is_email_verified: true } }));
    if (updatePlatformUser.rejected.match(result)) {
      toast.error("Couldn't verify email", { description: result.error.message ?? "Please try again." });
      return;
    }
    toast.success("Email marked as verified");
    dispatch(fetchPlatformUsers({}));
  };

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold uppercase">
          {initial}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium">
              {user.first_name} {user.last_name}
            </span>
            {categories.map((c) => (
              <Badge key={c.key} variant="outline" className="px-1.5 py-0 text-[10px]">
                {c.label}
              </Badge>
            ))}
            {!user.is_email_verified && (
              <Badge variant="outline" className="px-1.5 py-0 text-[10px] text-amber-700 dark:text-amber-400">
                Unverified
              </Badge>
            )}
            {!active && (
              <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                Suspended
              </Badge>
            )}
          </div>
          <p className="truncate text-xs text-muted-foreground">{[user.email, user.phone].filter(Boolean).join(" • ")}</p>
        </div>
      </div>
      <div className="flex flex-shrink-0 items-center gap-2">
        <span className="text-xs text-muted-foreground">
          {new Date(user.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
        </span>
        {!user.is_email_verified && (
          <Button size="icon-sm" variant="ghost" onClick={handleVerifyEmail} aria-label="Mark email verified" title="Mark email verified">
            <BadgeCheck className="h-4 w-4" />
          </Button>
        )}
        <Button
          size="icon-sm"
          variant="ghost"
          className={active ? "text-destructive" : "text-emerald-600"}
          onClick={onSuspend}
          aria-label={active ? "Suspend user" : "Activate user"}
          title={active ? "Suspend user" : "Activate user"}
        >
          {active ? <Ban className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
