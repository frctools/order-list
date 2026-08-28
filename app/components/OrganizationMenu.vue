<script setup lang="ts">
import { computed, reactive, ref, watch, onMounted } from 'vue'
import * as z from 'zod'
import type { DropdownMenuItem, FormSubmitEvent } from '#ui/types'
import { createTeamSchema } from '~/composables/organizations'

const auth = useAuth()
const toast = useToast()

const activeMemberQuery = auth.client.useActiveMember()

const {
  organizations,
  organization: activeOrganization,
  isLoading: organizationsLoading,
  fetchOrganizations,
  fetchCurrentOrganization,
  selectTeam,
  createTeam
} = useOrgs()

if (import.meta.client) {
  onMounted(async () => {
    if (!organizations.value.length) {
      await fetchOrganizations()
    }
    if (!activeOrganization.value) {
      await fetchCurrentOrganization()
    }
  })
}
const isLoadingOrganizations = computed(() => organizationsLoading.value)

const isCreateModalOpen = ref(false)
const isInviteModalOpen = ref(false)
const isCreatePending = ref(false)
const isInvitePending = ref(false)

const lastAutoSlug = ref('')

const createOrganizationSchema = createTeamSchema

type CreateOrganizationForm = z.infer<typeof createOrganizationSchema>

const createOrganizationState = reactive<CreateOrganizationForm>({
  name: '',
  slug: '',
  logo: ''
})

watch(
  () => createOrganizationState.name,
  (value) => {
    const generated = slugify(value ?? '')
    if (
      !createOrganizationState.slug
      || createOrganizationState.slug === lastAutoSlug.value
    ) {
      createOrganizationState.slug = generated
      lastAutoSlug.value = generated
    }
  }
)

const inviteMemberSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  role: z.string().min(1, 'Role is required'),
  resend: z.boolean().default(false)
})

type InviteMemberForm = z.infer<typeof inviteMemberSchema>

const inviteMemberState = reactive<InviteMemberForm>({
  email: '',
  role: 'member',
  resend: false
})

const organizationDropdownItems = computed<DropdownMenuItem[][]>(() => {
  const items: DropdownMenuItem[][] = []

  if (organizations.value.length) {
    items.push(
      organizations.value.map(org => ({
        label: org.name,
        description: org.slug,
        icon:
          org.id === activeOrganization.value?.id
            ? 'i-lucide-check'
            : 'i-lucide-building-2',
        color: org.id === activeOrganization.value?.id ? 'primary' : undefined,
        onSelect: () => onSelectOrganization(org.id)
      }))
    )
  } else {
    items.push([
      {
        label: 'No organizations yet',
        icon: 'i-lucide-building-2',
        disabled: true
      }
    ])
  }

  items.push([
    {
      label: 'Create organization',
      icon: 'i-lucide-plus',
      onSelect: () => {
        isCreateModalOpen.value = true
      }
    }
  ])
  items.push([
    {
      label: 'Invite member',
      icon: 'i-lucide-user-plus',
      disabled: !activeOrganization.value,
      onSelect: () => {
        if (!activeOrganization.value) return
        isInviteModalOpen.value = true
      }
    }
  ])
  items.push([
    {
      label: 'Manage organization',
      icon: 'i-lucide-cog',
      to: '/organization'
    }
  ])
  return items
})

function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function resetCreateOrganizationForm() {
  createOrganizationState.name = ''
  createOrganizationState.slug = ''
  lastAutoSlug.value = ''
}

function resetInviteMemberForm() {
  inviteMemberState.email = ''
  inviteMemberState.role = 'member'
  inviteMemberState.resend = false
}

function extractErrorMessage(err: unknown): string {
  if (typeof err === 'string') return err
  if (err instanceof Error) return err.message
  if (err && typeof err === 'object') {
    const message = (err as { message?: string }).message
    if (message) return message
    const dataMessage = (err as { data?: { statusMessage?: string } }).data
      ?.statusMessage
    if (dataMessage) return dataMessage
  }
  return 'Something went wrong. Please try again.'
}

async function onSelectOrganization(id: string) {
  if (activeOrganization.value?.id === id) return
  try {
    await selectTeam(id, { showToast: true })
    await Promise.all([
      fetchOrganizations(),
      fetchCurrentOrganization(),
      activeMemberQuery.value.refetch?.()
    ])
    await refreshNuxtData()
  } catch (err) {
    toast.add({
      title: 'Unable to switch organization',
      description: extractErrorMessage(err),
      color: 'error',
      icon: 'i-lucide-alert-triangle'
    })
  }
}

async function handleCreateOrganization(
  event: FormSubmitEvent<CreateOrganizationForm>
) {
  isCreatePending.value = true
  try {
    const success = await createTeam(event)
    if (!success) return

    await Promise.all([
      fetchOrganizations(),
      fetchCurrentOrganization(),
      activeMemberQuery.value.refetch?.()
    ])
    await refreshNuxtData()
    isCreateModalOpen.value = false
    resetCreateOrganizationForm()
  } catch (err) {
    toast.add({
      title: 'Unable to create organization',
      description: extractErrorMessage(err),
      color: 'error',
      icon: 'i-lucide-alert-triangle'
    })
  } finally {
    isCreatePending.value = false
  }
}

async function handleInviteMember(event: FormSubmitEvent<InviteMemberForm>) {
  if (!activeOrganization.value) return
  isInvitePending.value = true
  try {
    const payload = {
      email: event.data.email,
      role: event.data.role as 'member' | 'admin',
      organizationId: activeOrganization.value.id,
      resend: event.data.resend
    }
    const { error } = await auth.client.organization.inviteMember(payload)
    if (error) throw error

    toast.add({
      title: 'Invitation sent',
      color: 'success',
      icon: 'i-lucide-send'
    })
    isInviteModalOpen.value = false
    resetInviteMemberForm()
  } catch (err) {
    toast.add({
      title: 'Unable to send invitation',
      description: extractErrorMessage(err),
      color: 'error',
      icon: 'i-lucide-alert-triangle'
    })
  } finally {
    isInvitePending.value = false
  }
}
</script>

<template>
  <div class="flex items-center gap-3">
    <UDropdownMenu
      :items="organizationDropdownItems"
      :popper="{ placement: 'bottom-start' }"
    >
      <UButton
        color="neutral"
        variant="ghost"
        icon="i-lucide-building-2"
        trailing-icon="i-lucide-chevron-down"
        :loading="isLoadingOrganizations"
      >
        <span v-if="activeOrganization">
          {{ activeOrganization.name }}
        </span>
        <span v-else> Select organization </span>
      </UButton>
    </UDropdownMenu>

    <ClientOnly>
      <UModal
        v-model:open="isCreateModalOpen"
        title="Create organization"
        description="Spin up a new workspace for your team."
      >
        <template #body>
          <UForm
            :schema="createOrganizationSchema"
            :state="createOrganizationState"
            class="space-y-4"
            @submit="handleCreateOrganization"
          >
            <UFormField
              label="Name"
              name="name"
              required
            >
              <UInput
                v-model="createOrganizationState.name"
                placeholder="Acme Robotics"
              />
            </UFormField>

            <UFormField
              label="Slug"
              name="slug"
              help="Used when generating invite links"
              required
            >
              <UInput
                v-model="createOrganizationState.slug"
                placeholder="acme-robotics"
              />
            </UFormField>

            <div class="flex justify-end gap-3 pt-2">
              <UButton
                type="button"
                color="neutral"
                variant="ghost"
                @click="
                  () => {
                    isCreateModalOpen = false;
                    resetCreateOrganizationForm();
                  }
                "
              >
                Cancel
              </UButton>
              <UButton
                type="submit"
                color="primary"
                :loading="isCreatePending"
              >
                Create organization
              </UButton>
            </div>
          </UForm>
        </template>
      </UModal>
    </ClientOnly>

    <ClientOnly>
      <UModal
        v-model:open="isInviteModalOpen"
        title="Invite a member"
        :description="`Send an email invite to join ${
          activeOrganization?.name ?? 'your organization'
        }.`"
      >
        <template #body>
          <UForm
            :schema="inviteMemberSchema"
            :state="inviteMemberState"
            class="space-y-4"
            @submit="handleInviteMember"
          >
            <UFormField
              label="Email"
              name="email"
              required
            >
              <UInput
                v-model="inviteMemberState.email"
                type="email"
                placeholder="alex@example.com"
              />
            </UFormField>

            <UFormField
              label="Role"
              name="role"
              help="Roles control what members can do."
            >
              <USelect
                v-model="inviteMemberState.role"
                :items="[
                  { label: 'Member', value: 'member' },
                  { label: 'Admin', value: 'admin' }
                ]"
                placeholder="Select role"
              />
            </UFormField>

            <UFormField name="resend">
              <UCheckbox
                v-model="inviteMemberState.resend"
                label="Resend invitation if this email is already invited"
              />
            </UFormField>

            <div class="flex justify-end gap-3 pt-2">
              <UButton
                type="button"
                color="neutral"
                variant="ghost"
                @click="
                  () => {
                    isInviteModalOpen = false;
                    resetInviteMemberForm();
                  }
                "
              >
                Cancel
              </UButton>
              <UButton
                type="submit"
                color="primary"
                :loading="isInvitePending"
              >
                Send invitation
              </UButton>
            </div>
          </UForm>
        </template>
      </UModal>
    </ClientOnly>
  </div>
</template>
