"use client"

import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"

import { cn } from "@/lib/utils"

function Tabs({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("flex flex-col gap-2.5", className)}
      {...props}
    />
  )
}

function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "level-1-dock bg-[#d8e5f2] border border-[#b8cde2] text-slate-700 inline-flex h-8 w-fit max-w-full items-center justify-start rounded-lg p-0.5 shadow-inner gap-1",
        className
      )}
      {...props}
    />
  )
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "snappy-btn inline-flex h-[calc(100%-2px)] items-center justify-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold whitespace-nowrap transition-all select-none cursor-pointer",
        "text-slate-700 hover:text-slate-950 hover:bg-white/60",
        "data-[state=active]:tab-card-active data-[state=active]:bg-white data-[state=active]:text-[#0369a1] data-[state=active]:font-extrabold data-[state=active]:shadow-xs data-[state=active]:border data-[state=active]:border-[#0284c7]",
        "disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
