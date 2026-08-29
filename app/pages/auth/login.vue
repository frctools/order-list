<template>
  <div>
    <UAlert
      v-if="ssoDenied"
      class="mb-4"
      color="warning"
      variant="soft"
      icon="i-lucide-mail-plus"
      title="That account has not been invited"
      description="Signing in with Google still needs an invitation from a team
        admin. Ask them to invite the address on that Google account."
    />

    <UAuthForm
      :fields="fields"
      :schema="schema"
      :providers="providerButtons"
      title="Welcome back"
      icon="i-lucide-lock"
      @submit="onSubmit"
    >
      <template #description>
        Accounts are by invitation. Ask a team admin to invite you, then create
        your account from the link in that email.
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

const route = useRoute()
const { signIn } = useAuth()

// Set by errorCallbackURL when the invitation gate refuses an OAuth account.
const ssoDenied = computed(() => route.query.sso === 'denied')

const { providerButtons } = useSocialAuth(() => '/app')

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
