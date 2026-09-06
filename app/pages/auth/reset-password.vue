<template>
  <div>
    <UAuthForm
      v-if="token && !complete"
      :fields="fields"
      :schema="schema"
      :loading="loading"
      title="Choose a new password"
      description="Enter a new password for your account."
      icon="i-lucide-lock-keyhole"
      :submit="{ label: 'Reset password' }"
      @submit="onSubmit"
    />

    <div
      v-else-if="complete"
      class="space-y-4 text-center"
    >
      <UIcon
        name="i-lucide-circle-check"
        class="mx-auto size-10 text-success"
      />
      <h1 class="text-2xl font-semibold">
        Password reset
      </h1>
      <p class="text-muted">
        Your password has been updated. You can now log in with it.
      </p>
      <UButton
        to="/auth/login"
        block
      >
        Continue to login
      </UButton>
    </div>

    <div
      v-else
      class="space-y-4 text-center"
    >
      <UIcon
        name="i-lucide-circle-alert"
        class="mx-auto size-10 text-error"
      />
      <h1 class="text-2xl font-semibold">
        Invalid reset link
      </h1>
      <p class="text-muted">
        This password reset link is invalid or has expired.
      </p>
      <UButton
        to="/auth/forgot-password"
        variant="soft"
        block
      >
        Request a new link
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
  title: 'Reset password',
  description: 'Choose a new password'
})

const route = useRoute()
const { resetPassword } = useAuth()
const toast = useToast()
const loading = ref(false)
const complete = ref(false)

const token = computed(() => {
  const value = route.query.token
  return typeof value === 'string' && !route.query.error ? value : null
})

const schema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string()
}).refine(data => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword']
})

type Schema = z.output<typeof schema>

const fields = [
  {
    name: 'password',
    type: 'password' as const,
    label: 'New password',
    placeholder: 'Enter a new password',
    required: true,
    autocomplete: 'new-password'
  },
  {
    name: 'confirmPassword',
    type: 'password' as const,
    label: 'Confirm password',
    placeholder: 'Enter your new password again',
    required: true,
    autocomplete: 'new-password'
  }
]

async function onSubmit(event: FormSubmitEvent<Schema>) {
  if (!token.value) return

  loading.value = true
  const { error } = await resetPassword({
    newPassword: event.data.password,
    token: token.value
  })
  loading.value = false

  if (error) {
    toast.add({
      title: 'Unable to reset password',
      description: error.message,
      color: 'error'
    })
    return
  }

  complete.value = true
}
</script>
