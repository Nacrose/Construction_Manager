"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { usePathname } from "next/navigation";
import { useUserPreferences } from "@/components/user-preferences-provider";
import { cn } from "@/lib/utils";

export type TabsProps = React.ComponentProps<typeof TabsPrimitive.Root> & {
  persistKey?: string;
  autoPersist?: boolean;
};

function Tabs({
  className,
  value: controlledValue,
  defaultValue,
  onValueChange,
  persistKey,
  autoPersist = false,
  ...props
}: TabsProps) {
  const { getPref, setPref } = useUserPreferences();
  const pathname = usePathname();

  const effectiveKey = persistKey || (autoPersist && pathname ? `tab_${pathname}` : undefined);

  // Initialize from saved preference if available
  const [internalValue, setInternalValue] = React.useState<string | undefined>(() => {
    if (controlledValue !== undefined) return controlledValue;
    if (effectiveKey) {
      const saved = getPref<string>(effectiveKey);
      if (saved) return saved;
    }
    return defaultValue;
  });

  // Sync if controlledValue changes
  React.useEffect(() => {
    if (controlledValue !== undefined) {
      setInternalValue(controlledValue);
    }
  }, [controlledValue]);

  // Sync parent state or internal state on mount and when preferences hydrate
  React.useEffect(() => {
    if (!effectiveKey) return;
    const saved = getPref<string>(effectiveKey);
    if (saved) {
      if (controlledValue !== undefined && saved !== controlledValue) {
        onValueChange?.(saved);
      } else if (controlledValue === undefined && saved !== internalValue) {
        setInternalValue(saved);
      }
    }
  }, [effectiveKey, getPref]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleValueChange = (newVal: string) => {
    if (controlledValue === undefined) {
      setInternalValue(newVal);
    }
    if (effectiveKey) {
      setPref(effectiveKey, newVal);
    }
    onValueChange?.(newVal);
  };

  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("flex flex-col gap-2.5", className)}
      value={controlledValue !== undefined ? controlledValue : internalValue}
      defaultValue={defaultValue}
      onValueChange={handleValueChange}
      {...props}
    />
  );
}

function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "level-1-dock text-muted-foreground dark:text-muted-foreground/80 inline-flex h-8 w-fit max-w-full items-center justify-start rounded-[5px] p-0.5 gap-1",
        className
      )}
      {...props}
    />
  );
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
        "text-muted-foreground hover:text-foreground hover:bg-card/70",
        "data-[state=active]:tab-card-active data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:font-bold",
        "disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
        className
      )}
      {...props}
    />
  );
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
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
