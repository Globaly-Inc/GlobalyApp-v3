"use client";

import { ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useAppSelector } from "@/lib/hooks";
import { ROLE_DISPLAY } from "../../consts";

export function MyProfileView() {
  const { me } = useAppSelector((state) => state.admin);
  if (!me) return null;

  const initial = me.name?.[0]?.toUpperCase() ?? "A";

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-foreground">My Profile</h1>
        <p className="text-muted-foreground mt-1">Your admin account details.</p>
      </div>

      <Card>
        <CardHeader className="flex-row items-center gap-4">
          <Avatar className="size-14">
            {me.photo_url && <AvatarImage src={me.photo_url} alt={me.name} />}
            <AvatarFallback>{initial}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <CardTitle className="text-base truncate">{me.name}</CardTitle>
            <p className="text-sm text-muted-foreground truncate">{me.email}</p>
          </div>
        </CardHeader>
        <CardContent>
          <Badge variant="secondary" className="gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" />
            {ROLE_DISPLAY[me.role]}
          </Badge>
        </CardContent>
      </Card>
    </div>
  );
}
