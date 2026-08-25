"use client";

import { fmt, type IpcItem } from "./helpers";
import { ItemRow } from "./item-row";

export function SectionGroup({
  name,
  items,
  canWrite,
  sub,
  ipcId,
  projectId,
}: {
  name: string;
  items: IpcItem[];
  canWrite: boolean;
  sub: { contractAmt: number; cumAmt: number; prevAmt: number; thisAmt: number };
  ipcId: string;
  projectId: string;
}) {
  return (
    <>
      <tr className="bg-muted/20">
        <td colSpan={14} className="border-r border-b p-2 font-semibold">
          {name}
        </td>
      </tr>
      {items.map((item) => (
        <ItemRow key={item.id} item={item} canWrite={canWrite} ipcId={ipcId} projectId={projectId} />
      ))}
      <tr className="bg-muted/10 font-medium">
        <td colSpan={5} className="border-r border-b p-2 text-right">Total of {name} =</td>
        <td className="border-r border-b p-2 text-right">{fmt(sub.contractAmt)}</td>
        <td className="border-r border-b p-2 text-right">{fmt(sub.cumAmt)}</td>
        <td className="border-r border-b p-2 text-right">{fmt(sub.prevAmt)}</td>
        <td className="border-r border-b p-2 text-right">{fmt(sub.thisAmt)}</td>
        <td className="border-r border-b p-2"></td>
        <td className="border-r border-b p-2"></td>
        <td colSpan={2} className="border-b p-2"></td>
      </tr>
    </>
  );
}
