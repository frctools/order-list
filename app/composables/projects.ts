export type Project = {
  id: string
  organizationId: string
  name: string
  slug: string
  description: string | null
  color: string
  isArchived: boolean
  createdAt: string | Date
  updatedAt: string | Date
}

export function useProjects() {
  const orgs = useOrgs()
  const requestFetch = useRequestFetch()
  const activeProjectId = useCookie<string | null>('activeProjectId', {
    sameSite: 'lax'
  })
  const projects = useState<Project[]>('projects', () => [])
  const project = useState<Project | null>('active-project', () => null)
  const loadedOrganizationId = useState<string | null>(
    'projects-organization-id',
    () => null
  )
  const isLoading = useState('projects-loading', () => false)
  const requestGeneration = useState('projects-request-generation', () => 0)

  const activeProjects = computed(() =>
    projects.value.filter(item => !item.isArchived)
  )

  function chooseActiveProject() {
    const saved = activeProjects.value.find(
      item => item.id === activeProjectId.value
    )
    project.value = saved ?? activeProjects.value[0] ?? null
    activeProjectId.value = project.value?.id ?? null
    return project.value
  }

  async function fetchProjects(options: { force?: boolean } = {}) {
    const organizationId = orgs.organization.value?.id
      ?? useAuth().session.value?.activeOrganizationId
      ?? null
    if (!organizationId) {
      clearProjects()
      return []
    }
    if (
      !options.force
      && loadedOrganizationId.value === organizationId
      && projects.value.length > 0
    ) {
      return projects.value
    }

    const generation = ++requestGeneration.value
    isLoading.value = true
    try {
      const response = await requestFetch<{ projects: Project[] }>(
        '/api/projects'
      )
      const currentOrganizationId = orgs.organization.value?.id
        ?? useAuth().session.value?.activeOrganizationId
        ?? null
      if (
        requestGeneration.value !== generation
        || currentOrganizationId !== organizationId
      ) {
        return projects.value
      }
      projects.value = response.projects
      loadedOrganizationId.value = organizationId
      chooseActiveProject()
      return projects.value
    } finally {
      if (requestGeneration.value === generation) {
        isLoading.value = false
      }
    }
  }

  function selectProject(id: string) {
    const selected = activeProjects.value.find(item => item.id === id)
    if (!selected) return false
    project.value = selected
    activeProjectId.value = selected.id
    return true
  }

  async function createProject(input: {
    name: string
    description?: string
    color?: string
  }) {
    const response = await requestFetch<{ project: Project }>('/api/projects', {
      method: 'POST',
      body: input
    })
    projects.value = [...projects.value, response.project]
    selectProject(response.project.id)
    return response.project
  }

  async function updateProject(
    id: string,
    input: Partial<Pick<Project, 'name' | 'description' | 'color' | 'isArchived'>>
  ) {
    const response = await requestFetch<{ project: Project }>(
      `/api/projects/${id}`,
      { method: 'PATCH', body: input }
    )
    projects.value = projects.value.map(item =>
      item.id === id ? response.project : item
    )
    if (project.value?.id === id) {
      project.value = response.project.isArchived ? null : response.project
    }
    chooseActiveProject()
    return response.project
  }

  function clearProjects() {
    requestGeneration.value++
    projects.value = []
    project.value = null
    loadedOrganizationId.value = null
    activeProjectId.value = null
  }

  return {
    projects,
    activeProjects,
    project,
    activeProjectId,
    isLoading,
    fetchProjects,
    selectProject,
    createProject,
    updateProject,
    clearProjects
  }
}
