import { Suspense } from "react";
import { ConfirmView } from "./confirm-view";

export const metadata = { title: "Confirm email" };

export default function ConfirmPage() {
  return (
    <Suspense>
      <ConfirmView />
    </Suspense>
  );
}
