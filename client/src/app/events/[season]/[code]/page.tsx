import { Suspense } from "react";
import { SkeletonRows } from "@/components/ui";
import { EventView } from "./event-view";

export default function EventPage() {
  return (
    <Suspense fallback={<SkeletonRows rows={8} />}>
      <EventView />
    </Suspense>
  );
}
