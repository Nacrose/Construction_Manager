import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-[3px] px-1.5 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-[0.08em] w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none transition-colors select-none",
  {
    variants: {
      variant: {
        default:
          "border border-amber/50 bg-amber/10 text-primary",
        secondary:
          "border border-border/80 bg-secondary/80 text-secondary-foreground",
        destructive:
          "border border-destructive/40 bg-destructive/10 text-destructive",
        outline:
          "border border-border bg-transparent text-foreground",
        amber:
          "border border-amber/50 bg-amber/15 text-primary",
        cyan:
          "border border-info/40 bg-cyan-500/10 text-info dark:text-info",
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
