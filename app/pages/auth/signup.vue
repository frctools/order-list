<template>
  <div>
    <UAuthForm
      :fields="fields"
      :schema="schema"
      title="Create an account"
      :submit="{ label: 'Create account' }"
      :loading="isSubmitting"
      @submit="onSubmit"
    >
      <template #description>
        Already have an account?
        <ULink
          :to="{ path: '/auth/login', query: route.query.redirect ? { redirect: route.query.redirect } : undefined }"
          class="text-primary font-medium"
        >Log in</ULink>.
      </template>

      <template #footer>
        By signing up, you agree to our
        <ULink
          to="/docs/privacy"
          class="text-primary font-medium"
        >Privacy Policy</ULink>.
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

const route = useRoute()
const { signUp } = useAuth()

const redirectTarget = computed(() => {
  const redirect = route.query.redirect

  if (Array.isArray(redirect)) {
    return redirect[0]?.startsWith('/') && !redirect[0]?.startsWith('//') ? redirect[0] : '/app'
  }

  if (typeof redirect === 'string' && redirect.startsWith('/') && !redirect.startsWith('//')) {
    return redirect
  }

  return '/app'
})

const schema = z.object({
  name: z.string().trim().min(1, 'Enter your name'),
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(8, 'Use at least 8 characters')
})

type Schema = z.output<typeof schema>

const toast = useToast()
const isSubmitting = ref(false)

async function onSubmit(event: FormSubmitEvent<Schema>) {
  if (isSubmitting.value) return
  isSubmitting.value = true
  try {
    const { data, error } = await signUp.email({
      name: event.data.name,
      email: event.data.email,
      password: event.data.password
    })
    if (data) {
      toast.add({
        title: 'Welcome to FRCTools Orders',
        color: 'success',
        icon: 'i-lucide-party-popper'
      })
      await useAuth().fetchSession()
      await navigateTo(redirectTarget.value)
    }
    if (error) {
      toast.add({
        title: 'Couldn’t create your account',
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
    name: 'name',
    type: 'text' as const,
    label: 'Name',
    placeholder: 'Your name',
    autocomplete: 'name',
    required: true
  },
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
    placeholder: 'At least 8 characters',
    autocomplete: 'new-password',
    required: true
  }
]
</script>
