"use client";

import useSWR, { useSWRConfig } from "swr";
import { post, type AuthState } from "./api";

/** Current sign-in state (shared across the app through SWR's cache). */
export function useAuth() {
  const { data, isLoading, mutate } = useSWR<AuthState>("/api/auth/me", { refreshInterval: 0, revalidateOnFocus: true });
  const { mutate: mutateAll } = useSWRConfig();
  const signOut = async () => {
    await post("/api/auth/logout");
    await mutate({ user: null, setupNeeded: false, setupEnabled: data?.setupEnabled ?? false }, false);
    mutateAll(() => true); // refresh anything that depends on who's signed in
  };
  return {
    user: data?.user ?? null,
    isAdmin: data?.user?.role === "admin",
    setupNeeded: data?.setupNeeded ?? false,
    setupEnabled: data?.setupEnabled ?? false,
    loading: isLoading,
    refresh: () => mutate(),
    signOut,
  };
}
