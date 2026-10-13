import { cn } from "@/lib/utils"

/**
 * Root wrapper for a portal page's content (GlobalyOS-V2 `PageBody`). The portal shell already owns
 * horizontal padding and max width, so pages add only vertical rhythm — never `px-*` or `max-w-*`.
 */
function PageBody({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="page-body" className={cn("space-y-4 md:space-y-6", className)} {...props} />
}

export { PageBody }
