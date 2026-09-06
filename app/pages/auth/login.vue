<template>
  <div>
    <UAuthForm
      :fields="fields"
      :schema="schema"
      title="Welcome back"
      icon="i-lucide-lock"
      @submit="onSubmit"
    >
      <template #description>
        Don't have an account?
        <ULink
          to="/auth/signup"
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

const schema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string()
})

type Schema = z.output<typeof schema>

const toast = useToast()
async function onSubmit(event: FormSubmitEvent<Schema>) {
  const { data, error } = await signIn.email(
    {
      email: event.data.email,
      password: event.data.password
    }
  )
  if (data) {
    toast.add({
      title: 'Success',
      description: 'You have successfully logged in.',
      color: 'success'
    })
    await useAuth().fetchSession()
    await navigateTo('/app')
  }
  if (error) {
    toast.add({
      title: 'Error',
      description: error.message,
      color: 'error'
    })
  }
}

const fields = [
  {
    name: 'email',
    type: 'text' as const,
    label: 'Email',
    placeholder: 'Enter your email',
    required: true
  },
  {
    name: 'password',
    label: 'Password',
    type: 'password' as const,
    placeholder: 'Enter your password'
  }
]
</script>
