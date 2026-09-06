import { createAuthClient } from 'better-auth/vue'
import { organizationClient } from 'better-auth/client/plugins'

import { defu } from 'defu'
import type { RouteLocationRaw } from 'vue-router'

interface RuntimeAuthConfig {
  redirectUserTo: RouteLocationRaw | string
  redirectGuestTo: RouteLocationRaw | string
}

export function useAuth() {
  const url = useRequestURL()

  const headers = import.meta.server ? useRequestHeaders() : undefined
  const requestEvent = import.meta.server ? useRequestEvent() : null

  const client = createAuthClient({
    plugins: [organizationClient()],
    baseURL: url.origin,
    fetchOptions: {
      headers
    }
  })
  type SessionResponse = Awaited<ReturnType<typeof client.getSession>>['data']

  const options = defu(
    useRuntimeConfig().public.auth as Partial<RuntimeAuthConfig>,
    {
      redirectUserTo: '/',
      redirectGuestTo: '/'
    }
  )
  const session = useState<(typeof client.$Infer.Session)['session'] | null>(
    'auth:session',
    () => null
  )
  const user = useState<(typeof client.$Infer.Session)['user'] | null>(
    'auth:user',
    () => null
  )
  const sessionFetching = import.meta.server
    ? ref(false)
    : useState('auth:sessionFetching', () => false)
  const activeOrganizationId = useCookie('activeOrganizationId')

  const fetchSession = async () => {
    if (sessionFetching.value) {
      return
    }
    sessionFetching.value = true
    let data: SessionResponse | null = null

    if (import.meta.server && requestEvent) {
      try {
        data = await requestEvent.$fetch<SessionResponse>(
          '/api/auth/get-session',
          {
            headers
          }
        )
      } catch (error) {
        console.error('SSR get-session failed', error)
      }
    }

    if (!data) {
      const res = await client.getSession({
        fetchOptions: {
          headers
        }
      })
      data = res.data ?? null
    }

    session.value = data?.session || null

    user.value = data?.user || null
    sessionFetching.value = false
    return data
  }

  if (import.meta.client) {
    client.$store.listen('$sessionSignal', async (signal) => {
      if (!signal) return
      await fetchSession()
    })
  }

  return {
    session,
    user,
    loggedIn: computed(() => !!session.value),
    signIn: client.signIn,
    signUp: client.signUp,
    requestPasswordReset: client.requestPasswordReset,
    resetPassword: client.resetPassword,
    async signOut({ redirectTo }: { redirectTo?: RouteLocationRaw } = {}) {
      const { clearState } = useOrgs()
      if (!user.value) {
        clearState()
        await navigateTo('/')
        return
      }

      const res = await client.signOut()
      session.value = null
      user.value = null
      activeOrganizationId.value = null
      clearState()

      if (redirectTo) {
        await navigateTo(redirectTo)
      }
      return res
    },
    options,
    fetchSession,
    client
  }
}
