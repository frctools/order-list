<template>
  <UCard class="w-full max-w-lg">
    <template #header>
      <div class="space-y-1">
        <h1 class="text-xl font-semibold">Authorize {{ clientName }}</h1>
        <p class="text-sm text-muted">
          This application is requesting access to your Orderr account.
        </p>
      </div>
    </template>

    <div class="space-y-4">
      <UAlert
        v-if="errorMessage"
        color="error"
        icon="i-lucide-circle-alert"
        :description="errorMessage"
      />

      <div>
        <p class="mb-2 text-sm font-medium">Requested permissions</p>
        <ul class="space-y-2 text-sm text-muted">
          <li
            v-for="scope in displayedScopes"
            :key="scope"
            class="flex items-center gap-2"
          >
            <UIcon name="i-lucide-check" class="text-primary size-4" />
            {{ scopeLabels[scope] ?? scope }}
          </li>
        </ul>
      </div>
    </div>

    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton
          color="neutral"
          variant="ghost"
          :loading="submitting === 'deny'"
          :disabled="Boolean(submitting)"
          @click="submitConsent(false)"
        >
          Deny
        </UButton>
        <UButton
          :loading="submitting === 'allow'"
          :disabled="Boolean(submitting)"
          @click="submitConsent(true)"
        >
          Allow access
        </UButton>
      </div>
    </template>
  </UCard>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'auth' })

useSeoMeta({
  title: 'Authorize application',
  description: 'Review an application requesting access to Orderr'
})

const route = useRoute()
const { client, fetchSession, loggedIn } = useAuth()
const submitting = ref<false | 'allow' | 'deny'>(false)
const errorMessage = ref('')

const clientId = computed(() => String(route.query.client_id ?? ''))
const displayedScopes = computed(() =>
  String(route.query.scope ?? '')
    .split(' ')
    .filter(Boolean)
)
const scopeLabels: Record<string, string> = {
  openid: 'Identify you securely',
  profile: 'Read your name and profile',
  email: 'Read your email address',
  offline_access: 'Stay connected after you close this page',
  'orders:read': 'Read your organizations, projects, and orders'
}

const { data: publicClient } = await useAsyncData(
  `oauth-client:${clientId.value}`,
  async () => {
    await fetchSession()
    if (!loggedIn.value) {
      await navigateTo({ path: '/auth/login', query: route.query })
      return null
    }
    if (!clientId.value) return null
    const response = await client.oauth2.publicClient({
      query: { client_id: clientId.value }
    })
    return response.data
  }
)

const clientName = computed(() => publicClient.value?.client_name || 'an application')

async function submitConsent(accept: boolean) {
  submitting.value = accept ? 'allow' : 'deny'
  errorMessage.value = ''

  const response = await client.oauth2.consent({ accept })
  if (response.error) {
    errorMessage.value = response.error.message || 'Unable to save your choice.'
    submitting.value = false
  }
}
</script>
