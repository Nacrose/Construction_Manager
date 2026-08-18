"use client";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FileSpreadsheet } from "lucide-react";
import { jsonArrayString } from "./types";

export function MeetingsSection({
  meetings,
  setMeetings,
  canEdit,
  saveField,
}: {
  meetings: any[];
  setMeetings: (val: any[]) => void;
  canEdit: boolean;
  saveField: (field: string, val: any) => void | Promise<void>;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Site Meetings & Toolbox
          Talks
        </h3>
        {canEdit && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => {
              const updated = [...meetings, { topic: "", attendees: "", notes: "" }];
              setMeetings(updated);
              saveField("meetings", jsonArrayString(updated));
            }}
          >
            + Add Meeting
          </Button>
        )}
      </div>

      <div className="rounded-md border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="h-7 text-[10px]">Topic / Subject</TableHead>
              <TableHead className="h-7 text-[10px] w-36">Attendees</TableHead>
              <TableHead className="h-7 text-[10px]">Key Notes / Decisions</TableHead>
              {canEdit && <TableHead className="h-7 w-6"></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {meetings.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={canEdit ? 4 : 3}
                  className="py-6 text-center text-xs text-muted-foreground"
                >
                  No meetings logged today.
                </TableCell>
              </TableRow>
            ) : (
              meetings.map((r, i) => (
                <TableRow key={i}>
                  <TableCell className="py-1 px-1">
                    <input
                      disabled={!canEdit}
                      className="w-full rounded border px-1 py-0.5 text-xs"
                      placeholder="Daily Morning Coordination / Safety Briefing"
                      value={r.topic || ""}
                      onChange={(e) => {
                        const c = [...meetings];
                        c[i] = { ...c[i], topic: e.target.value };
                        setMeetings(c);
                      }}
                      onBlur={() => saveField("meetings", jsonArrayString(meetings))}
                    />
                  </TableCell>
                  <TableCell className="py-1 px-1">
                    <input
                      disabled={!canEdit}
                      className="w-full rounded border px-1 py-0.5 text-xs"
                      placeholder="PM, Site Engineers, Foremen"
                      value={r.attendees || ""}
                      onChange={(e) => {
                        const c = [...meetings];
                        c[i] = { ...c[i], attendees: e.target.value };
                        setMeetings(c);
                      }}
                      onBlur={() => saveField("meetings", jsonArrayString(meetings))}
                    />
                  </TableCell>
                  <TableCell className="py-1 px-1">
                    <input
                      disabled={!canEdit}
                      className="w-full rounded border px-1 py-0.5 text-xs"
                      placeholder="Discussed casting schedule and lane diversion."
                      value={r.notes || ""}
                      onChange={(e) => {
                        const c = [...meetings];
                        c[i] = { ...c[i], notes: e.target.value };
                        setMeetings(c);
                      }}
                      onBlur={() => saveField("meetings", jsonArrayString(meetings))}
                    />
                  </TableCell>
                  {canEdit && (
                    <TableCell className="py-1 px-1">
                      <button
                        onClick={() => {
                          const updated = meetings.filter((_, j) => j !== i);
                          setMeetings(updated);
                          saveField("meetings", jsonArrayString(updated));
                        }}
                        className="text-muted-foreground hover:text-destructive text-xs"
                      >
                        ✕
                      </button>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
