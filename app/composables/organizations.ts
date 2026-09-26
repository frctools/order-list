import type { FormSubmitEvent } from '@nuxt/ui'
import type { Organization } from 'better-auth/plugins'
import * as z from 'zod'
import type { CookieRef } from '#app'

export const createTeamSchema = z.object({
  name: z.string().min(1, 'Team name is required'),
  slug: z.string().min(1, 'Team slug is required'),
  logo: z.string().optional()
})

export type CreateTeamSchema = z.output<typeof createTeamSchema>

export const useCurrentOrganization = () => {
  return useState<Organization | null>('organization', () => null)
}

/**
 * The persisted org choice. Shared per app instance so every caller sees the
 * same ref (separate useCookie() refs for the same name can drift apart).
 */
export const useActiveOrganizationCookie = () => {
  const nuxtApp = useNuxtApp() as ReturnType<typeof useNuxtApp> & {
    _activeOrganizationCookie?: CookieRef<string | null>
  }
  nuxtApp._activeOrganizationCookie ??= useCookie<string | null>(
    'activeOrganizationId',
    { sameSite: 'lax' }
  )
  return nuxtApp._activeOrganizationCookie
}

export function useOrgs() {
  const nuxtApp = useNuxtApp() as ReturnType<typeof useNuxtApp> & {
    _fetchOrganizations?: () => Promise<Organization[]>
  }
  const auth = useAuth()
  const { client } = auth
  const organization = useCurrentOrganization()
  const activeOrganizationId = useActiveOrganizationCookie()
  const toast = useToast()
  const requestFetch = useRequestFetch()

  const organizations = useState<Organization[]>('organizations', () => [])
  const isLoading = useState('orgs-loading', () => false)
  /** True once the org list + active org have been resolved for this user. */
  const loaded = useState('orgs-loaded', () => false)
  const hasOrganizations = computed(
    () => organizations.value && organizations.value.length > 0
  )

  function notifyError(title: string) {
    // Toasts queued during SSR would pop up after hydration out of context.
    if (import.meta.client) {
      toast.add({ title, color: 'error' })
    }
  }

  // requestFetch forwards the request cookies during SSR and calls the auth
  // handler in-process, instead of the auth client making an HTTP round trip
  // back to our own origin.
  async function getFullOrganization(orgId?: string) {
    try {
      return await requestFetch<Organization | null>(
        '/api/auth/organization/get-full-organization',
        { query: orgId ? { organizationId: orgId } : undefined }
      )
    } catch (error) {
      console.error('Failed to fetch organization', error)
      notifyError('Failed to fetch organization')
      return null
    }
  }

  async function loadOrganizations(): Promise<Organization[]> {
    isLoading.value = true
    try {
      let list: Organization[]
      try {
        list = (await requestFetch<Organization[]>(
          '/api/auth/organization/list'
        )) ?? []
      } catch (error) {
        console.error('Failed to fetch organizations', error)
        notifyError('Failed to fetch organizations')
        return organizations.value
      }

      organizations.value = list

      // The session is the source of truth (it is what the API routes use);
      // the cookie only remembers the last choice across logins.
      const sessionOrgId = auth.session.value?.activeOrganizationId
      const selected
        = list.find(org => org.id === sessionOrgId)
          ?? list.find(org => org.id === activeOrganizationId.value)
          ?? list[0]

      if (!selected) {
        organization.value = null
        activeOrganizationId.value = null
        loaded.value = true
        return list
      }

      if (import.meta.server && selected.id !== sessionOrgId) {
        // Switching the session's active org needs a real browser request
        // (Set-Cookie / origin checks), so leave it to the client. `loaded`
        // stays false and the client finishes the job after hydration.
        return list
      }

      const isActive = await ensureActiveOrganization(selected.id)
      if (isActive) {
        organization.value = (await getFullOrganization(selected.id)) ?? selected
      }
      loaded.value = true
      return list
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Loads the org list and resolves the active org. Concurrent callers share
   * one request (previously a second caller got the stale, often empty, list
   * back immediately while the first request was still running).
   */
  function fetchOrganizations() {
    nuxtApp._fetchOrganizations ??= createSingleFlight(loadOrganizations)
    return nuxtApp._fetchOrganizations()
  }

  async function fetchCurrentOrganization() {
    const id = auth.session.value?.activeOrganizationId ?? activeOrganizationId.value
    if (!id) return null
    const isActive = await ensureActiveOrganization(id)
    if (!isActive) return null
    organization.value = await getFullOrganization(id)
    return organization.value
  }

  async function ensureActiveOrganization(id: string) {
    if (auth.session.value?.activeOrganizationId === id) {
      activeOrganizationId.value = id
      return true
    }

    const { error } = await client.organization.setActive({
      organizationId: id
    })

    if (error) {
      activeOrganizationId.value = null
      organization.value = null
      notifyError('Failed to select organization')
      return false
    }

    activeOrganizationId.value = id
    await auth.fetchSession()
    return true
  }

  async function selectTeam(id: string, options: { showToast?: boolean } = {}) {
    const { showToast = true } = options
    const isActive = await ensureActiveOrganization(id)
    if (!isActive) return
    useProjects().clearProjects()
    await fetchCurrentOrganization()
    if (showToast) {
      toast.add({
        title: 'Team selected',
        color: 'success'
      })
    }
  }

  async function checkSlug(slug: string) {
    const { error } = await client.organization.checkSlug({
      slug
    })
    if (error?.code === 'SLUG_IS_TAKEN') {
      toast.add({
        title: 'Slug is taken',
        color: 'error'
      })
      return false
    }
    return true
  }

  async function createTeam(
    event: FormSubmitEvent<CreateTeamSchema>,
    options: { showToast?: boolean } = {}
  ) {
    const { showToast = true } = options
    const isSlugAvailable = await checkSlug(event.data.slug)
    if (!isSlugAvailable) return
    const { data, error } = await client.organization.create({
      name: event.data.name,
      slug: event.data.slug,
      logo: event.data.logo
    })
    if (error) {
      toast.add({
        title: 'Failed to create team',
        color: 'error'
      })
      return false
    }

    await fetchOrganizations()
    if (data) {
      await selectTeam(data.id, { showToast: false })
    }

    if (showToast) {
      toast.add({
        title: 'Team created',
        color: 'success'
      })
    }
    return true
  }

  async function deleteTeam(id: string, options: { showToast?: boolean } = {}) {
    const { showToast = true } = options
    const { error } = await client.organization.delete({
      organizationId: id
    })
    if (error) {
      toast.add({
        title: 'Failed to delete team',
        color: 'error'
      })
    }
    if (showToast) {
      toast.add({
        title: 'Team deleted',
        color: 'success'
      })
    }
    await fetchOrganizations()
  }

  function clearState() {
    activeOrganizationId.value = null
    organizations.value = []
    organization.value = null
    loaded.value = false
    useProjects().clearProjects()
  }

  return {
    organization,
    organizations,
    isLoading,
    loaded,
    hasOrganizations,
    fetchOrganizations,
    fetchCurrentOrganization,
    getFullOrganization,
    selectTeam,
    createTeam,
    deleteTeam,
    clearState
  }
}
