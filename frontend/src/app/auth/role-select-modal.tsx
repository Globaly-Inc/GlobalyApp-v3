"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useAppDispatch } from "@/lib/hooks";
import { updateRole, fetchMe, type PortalCategory } from "./store/auth-slice";
import { fetchFullProfile } from "@/app/personal/store/profile-slice";
import { RoleOptionCards } from "./role-select-view";

export function RoleSelectModal({
  open,
  onOpenChange,
}: Readonly<{ open: boolean; onOpenChange: (open: boolean) => void }>) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const [selected, setSelected] = useState<PortalCategory | null>(null);
  const [saving, setSaving] = useState(false);

  const handleContinue = async () => {
    if (!selected) return;
    setSaving(true);
    const result = await dispatch(updateRole({ category: selected }));
    if (updateRole.rejected.match(result)) {
      setSaving(false);
      toast.error("Failed to save your choice", { description: result.error.message ?? "Please try again." });
      return;
    }
    const [meResult] = await Promise.all([dispatch(fetchMe()), dispatch(fetchFullProfile())]);
    setSaving(false);
    toast.success("Account type saved!");
    onOpenChange(false);
    const me = fetchMe.fulfilled.match(meResult) ? meResult.payload : null;
    if (me?.user_category === "business") router.push("/business/profile");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>How will you use Globaly?</DialogTitle>
          <DialogDescription>Choose your account type to get the right experience.</DialogDescription>
        </DialogHeader>
        <RoleOptionCards selected={selected} onSelect={setSelected} />
        <DialogFooter>
          <Button className="h-10 cursor-pointer" variant="outline" onClick={() => onOpenChange(false)}>
            Later
          </Button>
          <Button className="h-10 cursor-pointer" onClick={handleContinue} disabled={!selected || saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
