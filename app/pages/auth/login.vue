<template>
  <div>
    <UAuthForm
      :fields="fields"
      :schema="schema"
      title="Welcome back"
      icon="i-lucide-lock"
      :loading="isSubmitting"
      :submit="{ label: 'Log in' }"
      @submit="onSubmit"
    >
      <template #description>
        Don't have an account?
        <ULink
          :to="{ path: '/auth/signup', query: route.query.redirect ? { redirect: route.query.redirect } : undefined }"
          class="text-primary font-medium"
        >Sign up</ULink>.
      </template>

      <template #footer>
        <ULink
          to="/auth/forgot-password"
          class="text-primary font-medium"
        >Forgot your password?</ULink>
      </template>
    </UAuthForm>
  </div>
</template>

<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '#ui/types'

definePageMeta({
  layout: 'auth'
})

useSeoMeta({
  title: 'Login',
  description: 'Login to your account to continue'
})

const { signIn } = useAuth()
const route = useRoute()
const isSubmitting = ref(false)

const redirectTarget = computed(() => {
  const redirect = Array.isArray(route.query.redirect)
    ? route.query.redirect[0]
    : route.query.redirect
  // Only allow same-site paths (not protocol-relative "//host" URLs).
  return typeof redirect === 'string' && redirect.startsWith('/') && !redirect.startsWith('//')
    ? redirect
    : '/app'
})

const schema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password')
})

type Schema = z.output<typeof schema>

const toast = useToast()
async function onSubmit(event: FormSubmitEvent<Schema>) {
  if (isSubmitting.value) return
  isSubmitting.value = true
  try {
    const { data, error } = await signIn.email(
      {
        email: event.data.email,
        password: event.data.password
      }
    )
    if (data) {
      await useAuth().fetchSession()
      if (!route.query.oauth_query) {
        await navigateTo(redirectTarget.value)
      }
    }
    if (error) {
      toast.add({
        title: 'Couldn’t log in',
        description: error.message,
        color: 'error',
        icon: 'i-lucide-alert-triangle'
      })
    }
  } finally {
    isSubmitting.value = false
  }
}

const fields = [
  {
    name: 'email',
    type: 'email' as const,
    label: 'Email',
    placeholder: 'you@example.com',
    autocomplete: 'email',
    required: true
  },
  {
    name: 'password',
    label: 'Password',
    type: 'password' as const,
    placeholder: 'Enter your password',
    autocomplete: 'current-password',
    required: true
  }
]
</script>
