"use client"

import * as React from "react"
import { CalendarIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

function toIsoDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

function fromIsoDate(value: string): Date | undefined {
  const [y, m, d] = value.slice(0, 10).split("-").map(Number)
  return y && m && d ? new Date(y, m - 1, d) : undefined
}

export type DatePickerProps = {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  fromYear?: number
  toYear?: number
  /** Month/year to open on when `value` is empty — see Calendar's defaultMonth. */
  defaultMonth?: Date
  disabled?: boolean | ((date: Date) => boolean)
  "aria-invalid"?: boolean
  className?: string
}

function DatePicker({ value, onChange, placeholder = "Pick a date", fromYear, toYear, defaultMonth, disabled, className, ...props }:  Readonly<DatePickerProps>) {
  const [open, setOpen] = React.useState(false)
  const selected = fromIsoDate(value)
  const controlDisabled = disabled === true
  const dayDisabled = typeof disabled === "function" ? disabled : undefined

  return (
    <Popover open={open} onOpenChange={controlDisabled ? undefined : setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            disabled={controlDisabled}
            aria-invalid={props["aria-invalid"]}
            className={cn("h-10 w-full justify-start gap-2 font-normal", !selected && "text-muted-foreground", className)}
          >
            <CalendarIcon className="h-4 w-4" />
            {selected ? selected.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : placeholder}
          </Button>
        }
      />
      <PopoverContent className="w-auto p-3">
        <Calendar
          selected={selected}
          onSelect={(date) => {
            onChange(toIsoDate(date))
            setOpen(false)
          }}
          fromYear={fromYear}
          toYear={toYear}
          defaultMonth={defaultMonth}
          disabled={dayDisabled}
        />
      </PopoverContent>
    </Popover>
  )
}

export { DatePicker }
