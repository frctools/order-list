<template>
  <div>
    <UAuthForm
      v-if="mode !== 'closed'"
      :fields="fields"
      :schema="schema"
      :providers="providerButtons"
      :title="title"
      :submit="{ label: 'Create account' }"
      @submit="onSubmit"
    >
      <template #description>
        <template v-if="mode === 'invitation'">
          You were invited as
          <span class="font-medium">{{ invitedEmail }}</span>. Choose a password
          to finish joining.
        </template>
        <template v-else>
          This is the first account on this instance, so it becomes the owner.
          Everyone else joins by invitation.
        </template>
      </template>

      <template #footer>
        By signing up, you agree to our
        <ULink
          to="/docs/privacy"
          class="text-primary font-medium"
        >Privacy Policy</ULink>.
      </template>
    </UAuthForm>

    <UCard v-else>
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon
            name="i-lucide-mail-plus"
            class="size-5 text-primary"
          />
          <h1 class="text-xl font-semibold">
            Invitation required
          </h1>
        </div>
      </template>

      <p class="text-sm text-muted">
        Innovators Parts is closed to open signups. An admin of your team
        invites you by email, and the link in that invitation lets you create
        your account.
      </p>

      <template #footer>
        <div class="flex flex-col gap-2 text-sm">
          <span class="text-muted">
            Already have an account?
            <ULink
              to="/auth/login"
              class="text-primary font-medium"
            >Log in</ULink>.
          </span>
          <span class="text-muted">
            An admin can invite you from
            <span class="font-medium">Organization → Members</span>.
          </span>
        </div>
      </template>
    </UCard>
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
  const value = Array.isArray(redirect) ? redirect[0] : redirect

  if (typeof value === 'string' && value.startsWith('/')) {
    return value
  }

  return '/app'
})

// An invite link lands here as ?redirect=/accept-invitation/<id>, so the id in
// that path is what tells the server which invitation to check.
const invitationId = computed(() => {
  const match = redirectTarget.value.match(/^\/accept-invitation\/([^/?#]+)/)
  return match?.[1] ? decodeURIComponent(match[1]) : ''
})

// Awaited so the form's initial state already carries the invited address —
// UAuthForm seeds its state from the fields once and does not re-seed.
const { data: status } = await useFetch('/api/signup-status', {
  query: { invitation: invitationId }
})

// Land back on the invitation after Google, so an invited person who signs up
// with Google still gets the invitation accepted.
const { providerButtons } = useSocialAuth(() => redirectTarget.value)

const mode = computed(() => status.value?.mode ?? 'closed')
const invitedEmail = computed(() => status.value?.email ?? '')

const title = computed(() =>
  mode.value === 'invitation' ? 'Accept your invitation' : 'Create an account'
)

useSeoMeta({
  title: () => (mode.value === 'closed' ? 'Invitation required' : title.value),
  description: 'Accounts on Innovators Parts are created by invitation.'
})

const schema = z.object({
  name: z.string().min(1),
  email: z.string().email('Invalid email'),
  password: z.string()
})

type Schema = z.output<typeof schema>

const toast = useToast()
async function onSubmit(event: FormSubmitEvent<Schema>) {
  const { data, error } = await signUp.email({
    name: event.data.name,
    // An invitation can only be accepted by the address it was sent to, so an
    // invited signup always uses that address rather than whatever was typed.
    email: invitedEmail.value || event.data.email,
    password: event.data.password
  })
  if (data) {
    toast.add({
      title: 'Success',
      description: 'You have successfully signed up!',
      color: 'success'
    })
    await useAuth().fetchSession()
    await navigateTo(redirectTarget.value)
  }

  if (error) {
    toast.add({
      title: 'Error',
      description: error.message,
      color: 'error'
    })
  }
}

const fields = computed(() => [
  {
    name: 'name',
    type: 'text' as const,
    label: 'Name',
    placeholder: 'Enter your name',
    required: true
  },
  {
    name: 'email',
    type: 'text' as const,
    label: 'Email',
    placeholder: 'Enter your email',
    required: true,
    defaultValue: invitedEmail.value || undefined,
    disabled: mode.value === 'invitation'
  },
  {
    name: 'password',
    label: 'Password',
    type: 'password' as const,
    placeholder: 'Enter your password'
  }
])
</script>
