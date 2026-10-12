"use client";

import { Copy, Lock, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { regenerateAccessCode, toggleSiteLock } from "../store/overview-slice";
import { WEB_ORIGIN } from "@/lib/hosts";

function copy(text: string, message: string) {
  navigator.clipboard.writeText(text);
  toast.success(message);
}

export function SiteAccessCard() {
  const dispatch = useAppDispatch();
  const settings = useAppSelector((state) => state.overview.siteAccess);

  if (!settings) return null;

  const inviteLink =
    typeof window !== "undefined" && settings.access_code
      ? `${WEB_ORIGIN || window.location.origin}/?access=${settings.access_code}`
      : "";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lock className="size-4 text-muted-foreground" />
          Site access lock
        </CardTitle>
        <CardAction>
          <Badge variant={settings.is_locked ? "destructive" : "secondary"}>
            {settings.is_locked ? "Locked" : "Open"}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">
          When locked, public pages require an access code to view.
        </p>
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-medium">Lock public pages</span>
          <Switch
            checked={settings.is_locked}
            onCheckedChange={(checked) => dispatch(toggleSiteLock(checked))}
          />
        </div>
        <div className="flex flex-col gap-3">
          <div>
            <Button variant="outline" size="sm" onClick={() => dispatch(regenerateAccessCode())}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
              Generate code
            </Button>
          </div>
          {settings.access_code && (
            <>
              <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2">
                <code className="flex-1 text-lg font-mono tracking-widest">{settings.access_code}</code>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => copy(settings.access_code!, "Code copied to clipboard")}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <div>
                <span className="text-xs font-medium text-muted-foreground">Shareable invite link</span>
                <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2 mt-1">
                  <code className="flex-1 text-xs font-mono truncate">{inviteLink}</code>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 flex-shrink-0"
                    onClick={() => copy(inviteLink, "Invite link copied")}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Anyone with this link bypasses the lock automatically. Share with investors only.
                </p>
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
