'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: Infinity,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        retry: 2,
      },
    },
  })
}

type QueryProviderProps = {
  children: ReactNode
}

export function QueryProvider({ children }: QueryProviderProps) {
  const [queryClient] = useState(createQueryClient)

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
