import { Loader2 } from "lucide-react";

/** Full-screen spinner while a portal loads the account it needs before it can draw the shell. */
export function PortalLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="Loading" />
    </div>
  );
}

/** Full-screen failure with the one way out that always works. */
export function PortalLoadError({ message, onSignOut }: Readonly<{ message: string; onSignOut: () => void }>) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
      <button type="button" onClick={onSignOut} className="text-sm font-medium text-primary underline underline-offset-4">
        Sign out
      </button>
    </div>
  );
}
