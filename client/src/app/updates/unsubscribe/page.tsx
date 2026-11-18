import { Suspense } from "react";
import { UnsubscribeView } from "./unsubscribe-view";

export const metadata = { title: "Unsubscribe" };

export default function UnsubscribePage() {
  return (
    <Suspense>
      <UnsubscribeView />
    </Suspense>
  );
}
