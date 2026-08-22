"use client";

import { use, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function MaterialLibraryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  useEffect(() => {
    router.replace(`/projects/${id}/rate-library`);
  }, [id, router]);

  return null;
}
