import { Suspense } from "react";
import { SkeletonRows } from "@/components/ui";
import { ScrimmagesView } from "./scrimmages-view";

export default function ScrimmagesPage() {
  return (
    <Suspense fallback={<SkeletonRows rows={6} />}>
      <ScrimmagesView />
    </Suspense>
  );
}
