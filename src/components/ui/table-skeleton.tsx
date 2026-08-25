"use client"

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"

export function TableSkeleton({
  columns = 5,
  rows = 8,
  className,
}: {
  columns?: number
  rows?: number
  className?: string
}) {
  return (
    <div className={cn("rounded-lg border border-border/40 overflow-hidden", className)}>
      <div className="overflow-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {Array.from({ length: columns }).map((_, i) => (
                <TableHead key={i}>
                  <div className="h-4 w-24 shimmer rounded bg-muted-foreground/20" />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: rows }).map((_, r) => (
              <TableRow key={r}>
                {Array.from({ length: columns }).map((_, c) => (
                  <TableCell key={c}>
                    <div
                      className={cn(
                        "shimmer rounded bg-muted-foreground/15",
                        c === 0 ? "h-4 w-32" : c === columns - 1 ? "h-4 w-20" : "h-4 w-full"
                      )}
                    />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
