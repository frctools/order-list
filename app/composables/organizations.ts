import type { FormSubmitEvent } from '@nuxt/ui'
import type { Organization } from 'better-auth/plugins'
import * as z from 'zod'

export const createTeamSchema = z.object({
  name: z.string().min(1, 'Team name is required'),
  slug: z.string().min(1, 'Team slug is required'),
  logo: z.string().optional()
})

export type CreateTeamSchema = z.output<typeof createTeamSchema>

export const useCurrentOrganization = () => {
  return useState<Organization | null>('organization', () => null)
}

export function useOrgs() {
  const auth = useAuth()
  const { client } = auth
  const organization = useCurrentOrganization()
  const activeOrganizationId = useCookie('activeOrganizationId')
  const toast = useToast()

  const organizations = useState<Organization[]>('organizations', () => [])
  const isLoading = useState('orgs-loading', () => false)
  const hasOrganizations = computed(
    () => organizations.value && organizations.value.length > 0
  )

  async function getFullOrganization(orgId?: string) {
    if (!orgId) {
      const { data, error } = await client.organization.getFullOrganization()
      if (error) {
        toast.add({
          title: 'Failed to fetch organization',
          color: 'error'
        })
      }
      return data
    }
    const { data, error } = await client.organization.getFullOrganization({
      query: { organizationId: orgId }
    })
    if (error) {
      toast.add({
        title: 'Failed to fetch organization',
        color: 'error'
      })
    }
    return data
  }

  async function fetchOrganizations() {
    if (isLoading.value) return organizations.value

    isLoading.value = true
    try {
      const { data, error } = await client.organization.list()

      if (error) {
        toast.add({
          title: 'Failed to fetch organizations',
          color: 'error'
        })
        return organizations.value
      }

      const fullOrgs = (await Promise.all(
        data!.map(org => getFullOrganization(org.id))
      )) as Organization[]

      organizations.value = fullOrgs

      const savedOrganization = fullOrgs.find(
        org => org.id === activeOrganizationId.value
      )
      const selectedOrganization = savedOrganization ?? fullOrgs[0]

      if (selectedOrganization) {
        if (!savedOrganization) {
          activeOrganizationId.value = selectedOrganization.id
          console.log(
            `Auto-selecting first organization: ${selectedOrganization.name}`
          )
        }
        const isActive = await ensureActiveOrganization(selectedOrganization.id)
        if (isActive) {
          organization.value = selectedOrganization
        }
      }

      return fullOrgs
    } finally {
      isLoading.value = false
    }
  }

  async function fetchCurrentOrganization() {
    if (!activeOrganizationId.value) return null
    const isActive = await ensureActiveOrganization(activeOrganizationId.value)
    if (!isActive) return null
    organization.value = await getFullOrganization(activeOrganizationId.value)
    return organization.value
  }

  async function ensureActiveOrganization(id: string) {
    if (auth.session.value?.activeOrganizationId === id) return true

    const { error } = await client.organization.setActive({
      organizationId: id
    })

    if (error) {
      activeOrganizationId.value = null
      organization.value = null
      toast.add({
        title: 'Failed to select organization',
        color: 'error'
      })
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
    useProjects().clearProjects()
  }

  return {
    organization,
    organizations,
    isLoading,
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
