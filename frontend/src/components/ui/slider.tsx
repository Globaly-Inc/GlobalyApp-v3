"use client"

import { Slider as SliderPrimitive } from "@base-ui/react/slider"

import { cn } from "@/lib/utils"

const thumbClassName =
  "block size-4 rounded-full border border-primary bg-background shadow transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"

function Slider<Value extends number | readonly number[] = number>({
  className,
  value,
  defaultValue,
  ...props
}: Readonly<SliderPrimitive.Root.Props<Value>>) {
  // Range mode (a two-value tuple) needs one indexed Thumb per value —
  // base-ui doesn't auto-multiply a single Thumb for array values.
  const thumbValues = value ?? defaultValue;
  const thumbCount = Array.isArray(thumbValues) ? thumbValues.length : 1;

  return (
    <SliderPrimitive.Root
      data-slot="slider"
      className={cn("relative flex w-full touch-none items-center select-none", className)}
      value={value}
      defaultValue={defaultValue}
      {...props}
    >
      <SliderPrimitive.Control className="flex w-full items-center py-1">
        <SliderPrimitive.Track className="relative h-1.5 w-full grow rounded-full bg-muted">
          <SliderPrimitive.Indicator data-slot="slider-indicator" className="absolute h-full rounded-full bg-primary" />
          {Array.from({ length: thumbCount }, (_, index) => (
            <SliderPrimitive.Thumb key={index} index={index} data-slot="slider-thumb" className={thumbClassName} />
          ))}
        </SliderPrimitive.Track>
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  )
}

export { Slider }
