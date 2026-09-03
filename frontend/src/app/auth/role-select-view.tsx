"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { GraduationCap, Building2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { updateRole, setSelectedCategory, type PortalCategory } from "./store/auth-slice";

const OPTIONS: { type: PortalCategory; icon: typeof GraduationCap; title: string; description: string }[] = [
  {
    type: "personal",
    icon: GraduationCap,
    title: "Personal",
    description: "Search courses, check eligibility, connect with institutions and agents worldwide.",
  },
  {
    type: "business",
    icon: Building2,
    title: "Business",
    description: "List your courses, connect with agents, manage enquiries and grow your global reach.",
  },
];

export function RoleOptionCards({
  selected,
  onSelect,
}: Readonly<{ selected: PortalCategory | null; onSelect: (value: PortalCategory) => void }>) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {OPTIONS.map((opt) => (
        <Card
          key={opt.type}
          onClick={() => onSelect(opt.type)}
          className={cn(
            "cursor-pointer transition-all hover:shadow-md border-2",
            selected === opt.type ? "border-primary bg-primary/5" : "border-border",
          )}
        >
          <CardContent className="p-8 text-center space-y-4">
            <div
              className={cn(
                "w-16 h-16 rounded-2xl flex items-center justify-center mx-auto",
                selected === opt.type ? "bg-primary text-primary-foreground" : "bg-muted",
              )}
            >
              <opt.icon className="h-8 w-8" />
            </div>
            <div>
              <h2 className="text-xl font-bold mb-2">{opt.title}</h2>
              <p className="text-sm text-muted-foreground">{opt.description}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function RoleSelectView() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { status, selectedCategory: selected } = useAppSelector((state) => state.auth);
  const loading = status === "updatingRole";

  const handleContinue = async () => {
    if (!selected) return;
    const result = await dispatch(updateRole({ category: selected }));
    if (updateRole.rejected.match(result)) {
      toast.error("Failed to save your choice", { description: result.error.message ?? "Please try again." });
      return;
    }
    router.push(selected === "personal" ? "/personal/profile" : "/business/onboarding");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-2xl">
        <div className="flex justify-center mb-8">
          <Link href="/">
            <Image src="/globalyapp-logo.png" alt="Globalyapp" width={727} height={157} className="h-10 w-auto" />
          </Link>
        </div>
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold mb-2">How will you use Globaly?</h1>
          <p className="text-muted-foreground">Choose your account type to get started with the right experience.</p>
        </div>
        <div className="mb-8">
          <RoleOptionCards selected={selected} onSelect={(value) => dispatch(setSelectedCategory(value))} />
        </div>
        <Button onClick={handleContinue} disabled={!selected || loading} size="lg" className="h-11 w-full cursor-pointer">
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Continue
        </Button>
      </div>
    </div>
  );
}
