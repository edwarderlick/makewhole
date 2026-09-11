"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function PipelineIdPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  useEffect(() => {
    router.replace(`/job/${id}`);
  }, [id, router]);
  return <p className="p-pad-lg font-label-code text-[12px]">Opening job…</p>;
}
