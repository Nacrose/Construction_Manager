import { redirect } from "next/navigation";

export default async function Page({ params }: { params: Promise<{ id: string; reportId: string }> }) {
  const { id, reportId } = await params;
  redirect(`/projects/${id}/workflow/reports/${reportId}`);
}
