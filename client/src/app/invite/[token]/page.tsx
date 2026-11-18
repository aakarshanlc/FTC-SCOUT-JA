import { Suspense } from "react";
import { InviteView } from "./invite-view";

export default function InvitePage() {
  return (
    <Suspense>
      <InviteView />
    </Suspense>
  );
}
