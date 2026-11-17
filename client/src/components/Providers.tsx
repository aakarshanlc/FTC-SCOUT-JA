"use client";

import { SWRConfig } from "swr";
import type { ReactNode } from "react";
import { REFRESH_MS, fetcher } from "@/lib/api";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SWRConfig value={{ fetcher, refreshInterval: REFRESH_MS, revalidateOnFocus: true }}>
      {children}
    </SWRConfig>
  );
}
