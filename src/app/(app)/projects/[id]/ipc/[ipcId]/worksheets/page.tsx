import type { Metadata } from "next";
import { IpcWorksheetWorkspace } from "@/components/worksheet/ipc-worksheet-workspace";

export const metadata: Metadata = { title: "IPC Working Papers | Construction Manager" };

export default async function IpcWorksheetsPage({ params }: { params: Promise<{ id: string; ipcId: string }> }) {
  const { id, ipcId } = await params;
  return <IpcWorksheetWorkspace projectId={id} ipcId={ipcId} />;
}
