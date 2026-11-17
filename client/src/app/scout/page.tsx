import { Suspense } from "react";
import { ScoutForms } from "./scout-forms";

export default function ScoutPage() {
  return (
    <Suspense>
      <ScoutForms />
    </Suspense>
  );
}
