import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "file:text-foreground placeholder:text-muted-foreground/70 selection:bg-amber/40 selection:text-[#1a1206] border-border bg-card flex h-8 w-full min-w-0 rounded-[4px] border px-2.5 py-1 text-xs text-foreground shadow-xs transition-all duration-150 outline-none file:inline-flex file:h-6.5 file:border-0 file:bg-transparent file:text-xs file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "focus:border-primary focus:ring-[3px] focus:ring-amber/25 focus:shadow-[0_0_0_1px_var(--amber)]",
        className
      )}
      {...props}
    />
  )
}

export { Input }
