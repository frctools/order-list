import { useQuery } from '@tanstack/vue-query'
import type { Ref } from 'vue'

export const ORDERS_QUERY_KEY = ['orders'] as const

export function useOrdersQuery(projectId: Ref<string | null>) {
  const requestFetch = useRequestFetch()

  return useQuery({
    queryKey: computed(() => [...ORDERS_QUERY_KEY, projectId.value]),
    enabled: computed(() => Boolean(projectId.value)),
    queryFn: async () => {
      const response = await requestFetch('/api/orders', {
        query: { projectId: projectId.value! }
      })
      return response.orders ?? []
    }
  })
}
