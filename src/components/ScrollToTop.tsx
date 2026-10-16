"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/** Scrolls to the top on route change, mirroring the SPA's hash-change behaviour. */
export default function ScrollToTop() {
  const pathname = usePathname();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}
