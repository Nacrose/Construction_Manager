import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded text-sm font-medium transition-all duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-1 focus-visible:ring-ring select-none cursor-pointer",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground font-semibold shadow-sm hover:brightness-110 hover:shadow-[0_0_14px_rgba(0,255,102,0.35)]",
        destructive:
          "bg-destructive/15 text-destructive border border-destructive/40 shadow-xs hover:bg-destructive/25 hover:border-destructive",
        outline:
          "border border-border bg-card/60 text-foreground shadow-xs hover:border-primary hover:text-primary hover:bg-accent/40",
        secondary:
          "bg-secondary text-secondary-foreground border border-border/40 shadow-xs hover:bg-secondary/80 hover:border-border",
        ghost:
          "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-8.5 px-3.5 py-1.5 has-[>svg]:px-2.5 text-xs",
        sm: "h-7.5 rounded gap-1 px-2.5 has-[>svg]:px-2 text-xs",
        lg: "h-9.5 rounded px-5 has-[>svg]:px-3.5 text-sm",
        icon: "size-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
