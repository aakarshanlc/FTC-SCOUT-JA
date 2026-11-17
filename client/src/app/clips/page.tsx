import { Suspense } from "react";
import { SkeletonRows } from "@/components/ui";
import { ClipsView } from "./clips-view";

export default function ClipsPage() {
  return (
    <Suspense fallback={<SkeletonRows rows={6} />}>
      <ClipsView />
    </Suspense>
  );
}
