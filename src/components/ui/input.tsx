import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground border-border bg-card/80 flex h-8.5 w-full min-w-0 rounded border px-3 py-1 text-xs text-foreground shadow-xs transition-all duration-150 outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-xs file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "focus:border-primary focus:ring-1 focus:ring-primary focus:shadow-[0_0_10px_rgba(0,255,102,0.2)]",
        className
      )}
      {...props}
    />
  )
}

export { Input }
