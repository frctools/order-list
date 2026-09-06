<template>
  <div>
    <UAuthForm
      v-if="!sent"
      :fields="fields"
      :schema="schema"
      :loading="loading"
      title="Forgot your password?"
      description="Enter your email and we'll send you a reset link."
      icon="i-lucide-key-round"
      :submit="{ label: 'Send reset link' }"
      @submit="onSubmit"
    >
      <template #footer>
        <ULink
          to="/auth/login"
          class="text-primary font-medium"
        >Back to login</ULink>
      </template>
    </UAuthForm>

    <div
      v-else
      class="space-y-4 text-center"
    >
      <UIcon
        name="i-lucide-mail-check"
        class="mx-auto size-10 text-primary"
      />
      <h1 class="text-2xl font-semibold">
        Check your email
      </h1>
      <p class="text-muted">
        If an account exists for that address, we've sent a password reset link.
      </p>
      <UButton
        to="/auth/login"
        variant="soft"
        block
      >
        Back to login
      </UButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '#ui/types'

definePageMeta({
  layout: 'auth'
})

useSeoMeta({
  title: 'Forgot password',
  description: 'Request a password reset link'
})

const { requestPasswordReset } = useAuth()
const toast = useToast()
const loading = ref(false)
const sent = ref(false)

const schema = z.object({
  email: z.string().email('Invalid email')
})

type Schema = z.output<typeof schema>

const fields = [
  {
    name: 'email',
    type: 'email' as const,
    label: 'Email',
    placeholder: 'Enter your email',
    required: true,
    autocomplete: 'email'
  }
]

async function onSubmit(event: FormSubmitEvent<Schema>) {
  loading.value = true

  const { error } = await requestPasswordReset({
    email: event.data.email,
    redirectTo: `${window.location.origin}/auth/reset-password`
  })

  loading.value = false

  if (error) {
    toast.add({
      title: 'Unable to send reset link',
      description: error.message,
      color: 'error'
    })
    return
  }

  sent.value = true
}
</script>
