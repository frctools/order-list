interface SocialProvider {
  id: string
  label: string
  icon: string
}

/**
 * Social sign-in buttons for the auth pages.
 *
 * Which providers exist is decided by the server from its own environment, so a
 * deployment with no Google credentials renders no button rather than one that
 * fails when clicked. The list arrives asynchronously, which is fine here --
 * UAuthForm renders `providers` with v-for, so a late arrival just appears,
 * unlike `fields`, which it seeds into local state exactly once.
 *
 * `where` is the path to land on afterwards. For an invited signup that is the
 * accept-invitation URL, so the invitation is still accepted once Google hands
 * the session back.
 */
export function useSocialAuth(where: () => string) {
  const { signIn } = useAuth()
  const busy = ref<string | null>(null)

  const { data } = useFetch('/api/auth-providers', {
    default: () => ({ providers: [] as SocialProvider[] })
  })

  async function signInWith(provider: string) {
    busy.value = provider
    // Better Auth redirects the browser, so nothing after this runs on the
    // happy path. An uninvited account is refused by the same database hook
    // that guards email signup, and lands back on the login page with a flag
    // the page turns into an explanation.
    await signIn.social({
      provider,
      callbackURL: where(),
      errorCallbackURL: '/auth/login?sso=denied'
    })
    busy.value = null
  }

  const providerButtons = computed(() =>
    (data.value?.providers ?? []).map(provider => ({
      label: provider.label,
      icon: provider.icon,
      loading: busy.value === provider.id,
      disabled: busy.value !== null && busy.value !== provider.id,
      onClick: () => signInWith(provider.id)
    }))
  )

  return { providerButtons }
}
