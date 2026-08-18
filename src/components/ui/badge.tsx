import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded px-2 py-0.5 text-[11px] font-mono font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1.5 [&>svg]:pointer-events-none transition-colors select-none",
  {
    variants: {
      variant: {
        default:
          "border border-primary/40 bg-primary/10 text-primary shadow-[0_0_8px_rgba(0,255,102,0.15)]",
        secondary:
          "border border-border/80 bg-secondary/80 text-secondary-foreground",
        destructive:
          "border border-destructive/40 bg-destructive/10 text-destructive shadow-[0_0_8px_rgba(239,68,68,0.15)]",
        outline:
          "border border-border bg-transparent text-foreground",
        amber:
          "border border-amber-500/40 bg-amber-500/10 text-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.15)]",
        cyan:
          "border border-cyan-500/40 bg-cyan-500/10 text-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.15)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span"

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
