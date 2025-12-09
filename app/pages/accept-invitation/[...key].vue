<template>
  <div class="flex min-h-[60vh] items-center justify-center px-6 py-12">
    <UCard class="max-w-lg w-full space-y-6">
      <template #header>
        <h1 class="text-xl font-semibold text-gray-900 dark:text-gray-100">
          Accept invitation
        </h1>
        <p class="mt-2 text-sm text-gray-500">
          We&apos;re connecting you with your organization.
        </p>
      </template>

      <div
        v-if="pending"
        class="space-y-3"
      >
        <USkeleton class="h-4 w-2/3" />
        <USkeleton class="h-4 w-1/2" />
        <USkeleton class="h-10 w-full rounded-lg" />
        <p class="text-sm text-gray-500">
          Processing your invitation…
        </p>
      </div>

      <template v-else>
        <UAlert
          v-if="error"
          color="error"
          variant="soft"
          icon="i-lucide-alert-triangle"
          title="We couldn't accept this invitation"
          :description="error"
        />

        <div
          v-else
          class="space-y-3"
        >
          <UAlert
            color="success"
            variant="soft"
            icon="i-lucide-badge-check"
            title="Invitation accepted"
            description="Redirecting you to your workspace."
          />
          <UButton
            color="primary"
            :loading="true"
            class="w-full"
          >
            Opening workspace…
          </UButton>
        </div>
      </template>
    </UCard>
  </div>
</template>

<script setup lang="ts">
const route = useRoute()
const auth = useAuth()

const redirectTarget = route.fullPath
const pending = ref(true)
const error = ref<string | null>(null)

if (!auth.loggedIn.value) {
  await navigateTo({
    path: '/auth/signup',
    query: { redirect: redirectTarget }
  })
} else {
  const invitationId = String(route.params.key ?? '')

  if (!invitationId) {
    error.value = 'Missing invitation identifier.'
    pending.value = false
  } else {
    try {
      const res = await auth.client.organization.acceptInvitation({
        invitationId
      })
      if (res.error) {
        throw new Error(res.error.message)
      }
      const orgs = useOrgs();
      await orgs.fetchOrganizations();

      await navigateTo('/app');
    } catch (err) {
      console.log(err)
      if (err instanceof Error) {
        error.value = err.message
      } else if (typeof err === 'string') {
        error.value = err
      } else {
        error.value = 'Something went wrong while accepting the invitation.'
      }
    } finally {
      pending.value = false
    }
  }
}
</script>
