import { createAuthClient } from 'better-auth/vue'
import { organizationClient } from 'better-auth/client/plugins'
import { oauthProviderClient } from '@better-auth/oauth-provider/client'
import { apiKeyClient } from '@better-auth/api-key/client'

import { defu } from 'defu'
import type { NuxtApp } from '#app'
import type { RouteLocationRaw } from 'vue-router'

interface RuntimeAuthConfig {
  redirectUserTo: RouteLocationRaw | string
  redirectGuestTo: RouteLocationRaw | string
}

function makeAuthClient(origin: string, headers?: Record<string, string>) {
  return createAuthClient({
    plugins: [organizationClient(), oauthProviderClient(), apiKeyClient()],
    baseURL: origin,
    fetchOptions: {
      headers
    }
  })
}

type AuthClient = ReturnType<typeof makeAuthClient>
type SessionResponse = Awaited<ReturnType<AuthClient['getSession']>>['data']

interface AuthRuntime {
  client: AuthClient
  fetchSession: () => Promise<SessionResponse | null>
}

export function useAuth() {
  const nuxtApp = useNuxtApp() as NuxtApp & { _auth?: AuthRuntime }

  const options = defu(
    useRuntimeConfig().public.auth as Partial<RuntimeAuthConfig>,
    {
      redirectUserTo: '/',
      redirectGuestTo: '/'
    }
  )
  const session = useState<(AuthClient['$Infer']['Session'])['session'] | null>(
    'auth:session',
    () => null
  )
  const user = useState<(AuthClient['$Infer']['Session'])['user'] | null>(
    'auth:user',
    () => null
  )
  const activeOrganizationId = useActiveOrganizationCookie()

  if (!nuxtApp._auth) {
    const url = useRequestURL()
    const headers = import.meta.server ? useRequestHeaders() : undefined
    const requestEvent = import.meta.server ? useRequestEvent() : null
    const client = makeAuthClient(url.origin, headers)

    const fetchSession = createSingleFlight(async () => {
      let data: SessionResponse | null = null

      if (import.meta.server && requestEvent) {
        try {
          data = await requestEvent.$fetch<SessionResponse>(
            '/api/auth/get-session',
            { headers }
          )
        } catch (error) {
          console.error('SSR get-session failed', error)
        }
      }

      if (!data) {
        try {
          const res = await client.getSession({ fetchOptions: { headers } })
          data = res.data ?? null
        } catch (error) {
          console.error('get-session failed', error)
        }
      }

      // useState refs point at shared payload state, so these stay valid
      // for later callers too.
      session.value = data?.session || null
      user.value = data?.user || null
      return data
    })

    if (import.meta.client) {
      client.$store.listen('$sessionSignal', (signal) => {
        if (!signal) return
        void fetchSession()
      })
    }

    nuxtApp._auth = { client, fetchSession }
  }

  const { client, fetchSession } = nuxtApp._auth

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
