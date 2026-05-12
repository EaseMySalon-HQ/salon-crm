"use client"

import { useState, type ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

/**
 * Global React Query policy — see `lib/queries/staleness.ts` for per-resource
 * `staleTime` constants. Defaults here are intentionally conservative; individual
 * queries should override `staleTime`/`gcTime` to match the underlying data freshness
 * (auth/me: 5–10 min, dashboard: 60–120 s, reports: 2–5 min, catalog: 5–15 min).
 *
 * `refetchOnWindowFocus` and `refetchOnReconnect` are off by default to avoid
 * burst-refetching on tab-switch / mobile-network blips, which were major sources of
 * duplicate API traffic. Network failures still retry once via React Query defaults.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            gcTime: 5 * 60_000,
            refetchOnWindowFocus: false,
            refetchOnReconnect: false,
            retry: 1,
          },
        },
      })
  )

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
