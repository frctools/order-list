export default defineNuxtRouteMiddleware(async (to) => {
  // await useAuth().fetchSession()
  const auth = useAuth()
  if (!auth.loggedIn.value) {
    if (to.path.startsWith('/app')) {
      return navigateTo({
        path: '/auth/login',
        query: to.fullPath !== '/app' ? { redirect: to.fullPath } : undefined
      })
    }
  }
  if (to.path === '/search' || to.path.startsWith('/products/')) {
    setPageLayout(auth.loggedIn.value ? 'app' : 'default')
  }
  if (auth.loggedIn.value) {
    const orgs = useOrgs()
    if (!orgs.loaded.value) {
      await orgs.fetchOrganizations()
    }
  }
  if (auth.session.value && to.path === '/organization') {
    if (
      import.meta.server
    ) {
      return
    }
    const membership = await auth.client.organization.getActiveMember()

    if (
      membership.data?.role !== 'admin'
      && membership.data?.role !== 'owner'
    ) {
      return navigateTo('/app')
    }
  }
  if (
    auth.loggedIn.value
    && (to.path === '/auth/login' || to.path === '/auth/signup')
  ) {
    return navigateTo('/app')
  }
})
