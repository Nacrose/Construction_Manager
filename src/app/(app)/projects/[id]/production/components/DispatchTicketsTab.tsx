"use client";

import { format } from "date-fns";
import {
  Search,
  X,
  Loader2,
  Printer,
  MoreVertical,
  CheckCircle2,
  Truck,
  AlertTriangle,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TICKET_STATUS_STYLES } from "./types";

export function DispatchTicketsTab({
  tickets,
  ticketsLoading,
  ticketSearch,
  setTicketSearch,
  ticketPlantFilter,
  setTicketPlantFilter,
  ticketStatusFilter,
  setTicketStatusFilter,
  plants,
  canWrite,
  setPrintTicket,
  updateTicketStatusMutation,
  setDeleteTicketTarget,
}: {
  tickets: any[];
  ticketsLoading: boolean;
  ticketSearch: string;
  setTicketSearch: (val: string) => void;
  ticketPlantFilter: string;
  setTicketPlantFilter: (val: string) => void;
  ticketStatusFilter: string;
  setTicketStatusFilter: (val: string) => void;
  plants: any[];
  canWrite: boolean;
  setPrintTicket: (ticket: any) => void;
  updateTicketStatusMutation: any;
  setDeleteTicketTarget: (ticket: any) => void;
}) {
  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search ticket #, vehicle, driver, location..."
            value={ticketSearch}
            onChange={(e) => setTicketSearch(e.target.value)}
            className="h-8 pl-8 text-xs"
          />
        </div>
        <Select value={ticketPlantFilter} onValueChange={setTicketPlantFilter}>
          <SelectTrigger className="h-8 text-xs w-[150px]">
            <SelectValue placeholder="All Plants" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Plants</SelectItem>
            {plants.map((p) => (
              <SelectItem key={p.id} value={p.id} className="text-xs">
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={ticketStatusFilter} onValueChange={setTicketStatusFilter}>
          <SelectTrigger className="h-8 text-xs w-[130px]">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="dispatched">Dispatched</SelectItem>
            <SelectItem value="in_transit">In Transit</SelectItem>
            <SelectItem value="delivered">Delivered</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>

        {(ticketSearch || ticketPlantFilter !== "all" || ticketStatusFilter !== "all") && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs px-2"
            onClick={() => {
              setTicketSearch("");
              setTicketPlantFilter("all");
              setTicketStatusFilter("all");
            }}
          >
            <X className="h-3 w-3" /> Reset
          </Button>
        )}
      </div>

      {/* Tickets Data Table */}
      <div className="rounded-md border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="h-8 text-xs font-semibold">Chalan / Ticket #</TableHead>
              <TableHead className="h-8 text-xs font-semibold">Time & Date</TableHead>
              <TableHead className="h-8 text-xs font-semibold">Plant / Source</TableHead>
              <TableHead className="h-8 text-xs font-semibold">Mix Grade (JMF)</TableHead>
              <TableHead className="h-8 text-xs font-semibold">Vehicle & Driver</TableHead>
              <TableHead className="h-8 text-xs font-semibold text-right">Dispatched</TableHead>
              <TableHead className="h-8 text-xs font-semibold">Slump / Temp</TableHead>
              <TableHead className="h-8 text-xs font-semibold">Destination Structure</TableHead>
              <TableHead className="h-8 text-xs font-semibold text-center">Status</TableHead>
              <TableHead className="h-8 text-xs font-semibold text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ticketsLoading ? (
              <TableRow>
                <TableCell colSpan={10} className="py-8 text-center">
                  <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : tickets.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="py-8 text-center text-xs text-muted-foreground">
                  No batch dispatch tickets found. Click &quot;New Dispatch Ticket&quot; to issue a
                  load.
                </TableCell>
              </TableRow>
            ) : (
              tickets.map((t) => (
                <TableRow key={t.id} className="hover:bg-muted/40 transition-colors">
                  <TableCell className="py-2 font-mono text-xs font-bold text-foreground">
                    {t.ticketNumber}
                  </TableCell>
                  <TableCell className="py-2 text-xs text-muted-foreground">
                    {format(new Date(t.dispatchDate), "dd MMM yyyy, HH:mm")}
                  </TableCell>
                  <TableCell className="py-2 text-xs font-medium text-foreground">
                    {t.plant.name}
                  </TableCell>
                  <TableCell className="py-2 text-xs">
                    <Badge variant="outline" className="text-[11px] font-mono">
                      {t.mixDesign?.code || "Custom Mix"}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-2 text-xs">
                    <div className="flex flex-col">
                      <span className="font-semibold text-foreground">{t.transitVehicleNo}</span>
                      {t.driverName && (
                        <span className="text-[10px] text-muted-foreground">{t.driverName}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="py-2 text-xs text-right font-mono font-bold text-foreground">
                    {t.dispatchedQty} {t.unit}
                  </TableCell>
                  <TableCell className="py-2 text-xs text-muted-foreground">
                    {t.slumpMm
                      ? `${t.slumpMm} mm slump`
                      : t.temperatureC
                        ? `${t.temperatureC}°C`
                        : "—"}
                  </TableCell>
                  <TableCell className="py-2 text-xs max-w-[180px] truncate text-muted-foreground">
                    {t.siteLocation || t.targetStructure || "Site Pour"}
                  </TableCell>
                  <TableCell className="py-2 text-center">
                    <Badge
                      variant="secondary"
                      className={cn("text-[10px] capitalize", TICKET_STATUS_STYLES[t.status])}
                    >
                      {t.status.replace("_", " ")}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                        onClick={() => setPrintTicket(t)}
                        title="Print Gate Pass / Chalan"
                      >
                        <Printer className="h-3.5 w-3.5" />
                      </Button>

                      {canWrite && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0 text-muted-foreground"
                            >
                              <MoreVertical className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="text-xs">
                            <DropdownMenuLabel>Update Status</DropdownMenuLabel>
                            {t.status !== "delivered" && (
                              <DropdownMenuItem
                                onClick={() =>
                                  updateTicketStatusMutation.mutate({
                                    id: t.id,
                                    status: "delivered",
                                    receivedQty: t.dispatchedQty,
                                  })
                                }
                              >
                                <CheckCircle2 className="h-3.5 w-3.5 mr-1.5 text-success" />{" "}
                                Mark Delivered
                              </DropdownMenuItem>
                            )}
                            {t.status !== "in_transit" && (
                              <DropdownMenuItem
                                onClick={() =>
                                  updateTicketStatusMutation.mutate({
                                    id: t.id,
                                    status: "in_transit",
                                  })
                                }
                              >
                                <Truck className="h-3.5 w-3.5 mr-1.5 text-amber-600" /> In Transit
                              </DropdownMenuItem>
                            )}
                            {t.status !== "rejected" && (
                              <DropdownMenuItem
                                onClick={() =>
                                  updateTicketStatusMutation.mutate({
                                    id: t.id,
                                    status: "rejected",
                                    rejectionReason: "Slump/Temp failure",
                                  })
                                }
                              >
                                <AlertTriangle className="h-3.5 w-3.5 mr-1.5 text-red-600" /> Reject
                                Batch
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setDeleteTicketTarget(t)}
                            >
                              <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete Ticket
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
