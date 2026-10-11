"use client"

import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"

/**
 * The back arrow in a detail or form page's `PageHeader` (`leading` slot). `label` names where it goes,
 * e.g. "Back to countries", because an icon alone has no accessible name.
 */
function BackButton({ href, onClick, label }: Readonly<{ href?: string; onClick?: () => void; label: string }>) {
  const icon = <ArrowLeft />
  if (href) {
    return (
      <Button variant="ghost" size="icon" aria-label={label} title={label} render={<Link href={href} />}>
        {icon}
      </Button>
    )
  }
  return (
    <Button variant="ghost" size="icon" aria-label={label} title={label} onClick={onClick}>
      {icon}
    </Button>
  )
}

export { BackButton }
