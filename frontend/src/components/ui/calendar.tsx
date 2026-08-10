"use client"

import * as React from "react"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

function isSameDay(a: Date | undefined, b: Date | undefined) {
  return !!a && !!b && a.toDateString() === b.toDateString()
}

export type CalendarProps = {
  selected?: Date
  onSelect: (date: Date) => void
  fromYear?: number
  toYear?: number
  disabled?: (date: Date) => boolean
  className?: string
}

function Calendar({ selected, onSelect, fromYear, toYear, disabled, className }: Readonly<CalendarProps>) {
  const currentYear = new Date().getFullYear()
  const minYear = fromYear ?? currentYear - 100
  const maxYear = toYear ?? currentYear

  const [viewDate, setViewDate] = React.useState(() => selected ?? new Date(maxYear - 18, 0, 1))

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()

  const years = React.useMemo(() => {
    const list: number[] = []
    for (let y = maxYear; y >= minYear; y--) list.push(y)
    return list
  }, [minYear, maxYear])

  const firstWeekday = new Date(year, month, 1).getDay()
  const totalDays = new Date(year, month + 1, 0).getDate()
  const cells: (Date | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: totalDays }, (_, i) => new Date(year, month, i + 1)),
  ]

  return (
    <div data-slot="calendar" className={cn("w-full space-y-3", className)}>
      <div className="flex items-center gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => setViewDate(new Date(year, month - 1, 1))}
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </Button>
        <Select value={String(month)} onValueChange={(v) => setViewDate(new Date(year, Number(v), 1))}>
          <SelectTrigger className="flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MONTHS.map((m, i) => (
              <SelectItem key={m} value={String(i)}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={String(year)} onValueChange={(v) => setViewDate(new Date(Number(v), month, 1))}>
          <SelectTrigger className="w-[90px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {years.map((y) => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => setViewDate(new Date(year, month + 1, 1))}
        >
          <ChevronRightIcon className="h-4 w-4" />
        </Button>
      </div>
      <div className="grid grid-cols-7 text-center text-xs text-muted-foreground">
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((date, i) => {
          if (!date) return <div key={`empty-${i}`} />
          const isDisabled = disabled?.(date) ?? false
          const isSelected = isSameDay(date, selected)
          return (
            <button
              key={date.toISOString()}
              type="button"
              disabled={isDisabled}
              onClick={() => onSelect(date)}
              className={cn(
                "h-8 w-8 cursor-pointer rounded-md text-sm transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-30",
                isSelected && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
              )}
            >
              {date.getDate()}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export { Calendar }
