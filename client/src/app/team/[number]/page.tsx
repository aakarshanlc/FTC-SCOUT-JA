import { Suspense } from "react";
import { SkeletonRows } from "@/components/ui";
import { TeamView } from "./team-view";

export default function TeamPage() {
  return (
    <Suspense fallback={<SkeletonRows rows={8} />}>
      <TeamView />
    </Suspense>
  );
}
