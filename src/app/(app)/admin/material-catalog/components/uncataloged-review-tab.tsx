"use client";

import { UnrecognizedMaterialsTab } from "@/app/(app)/rate-catalogs/components/unrecognized-materials-tab";

export function UncatalogedReviewTab({
  level = "global",
  organizationId,
}: {
  level?: "global" | "org";
  organizationId?: string;
}) {
  return <UnrecognizedMaterialsTab level={level} organizationId={organizationId} />;
}
