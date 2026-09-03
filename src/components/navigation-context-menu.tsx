"use client";

import type { ReactNode } from "react";
import { Copy, ExternalLink, Link2 } from "lucide-react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import { useRouter } from "next/navigation";

/**
 * Shared navigation affordances. Domain pages add their own record actions;
 * this guarantees that any module link behaves consistently on right-click.
 */
export function NavigationContextMenu({ href, label, children }: { href: string; label: string; children: ReactNode }) {
  const router = useRouter();
  const absoluteHref = () => new URL(href, window.location.origin).toString();
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="z-50 min-w-44 rounded-[5px] border border-border bg-popover p-1 text-popover-foreground shadow-[0_8px_24px_rgba(79,62,45,0.16)]">
          <ContextMenu.Label className="px-2 py-1 text-[9px] font-mono uppercase tracking-[0.1em] text-muted-foreground">{label}</ContextMenu.Label>
          <ContextMenu.Separator className="my-1 h-px bg-border" />
          <ContextMenu.Item className="flex cursor-pointer items-center gap-2 rounded-[3px] px-2 py-1.5 text-xs outline-none data-[highlighted]:bg-accent" onSelect={() => router.push(href)}><ExternalLink className="h-3.5 w-3.5 text-primary" />Open</ContextMenu.Item>
          <ContextMenu.Item className="flex cursor-pointer items-center gap-2 rounded-[3px] px-2 py-1.5 text-xs outline-none data-[highlighted]:bg-accent" onSelect={() => window.open(href, "_blank", "noopener,noreferrer")}><Link2 className="h-3.5 w-3.5 text-primary" />Open in new tab</ContextMenu.Item>
          <ContextMenu.Item className="flex cursor-pointer items-center gap-2 rounded-[3px] px-2 py-1.5 text-xs outline-none data-[highlighted]:bg-accent" onSelect={() => navigator.clipboard.writeText(absoluteHref())}><Copy className="h-3.5 w-3.5 text-primary" />Copy link</ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
