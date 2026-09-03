import type { Metadata } from "next";
import { WorksheetWorkspace } from "@/components/worksheet/worksheet-workspace";

export const metadata: Metadata = {
  title: "Worksheet Laboratory | Construction Manager",
};

export default function WorksheetLabPage() {
  return <WorksheetWorkspace />;
}
