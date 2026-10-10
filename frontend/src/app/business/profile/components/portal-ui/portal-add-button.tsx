"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Primary "+ Add …" button: lifts on hover and its + turns a quarter. */
export function PortalAddButton({ children, onClick, disabled }: Readonly<{ children: React.ReactNode; onClick?: () => void; disabled?: boolean }>) {
  return (
    <Button
      className="group/add h-10 gap-1.5 rounded-[10px] transition-[transform,box-shadow] hover:-translate-y-px hover:shadow-[0_6px_18px_-6px_var(--color-primary)] active:translate-y-0 active:scale-[.98]"
      onClick={onClick}
      disabled={disabled}
    >
      <Plus className="h-4 w-4 transition-transform duration-300 ease-[cubic-bezier(.34,1.56,.64,1)] group-hover/add:rotate-90" />
      {children}
    </Button>
  );
}
