<template>
  <DashboardPage
    id="organization"
    :title="activeOrganization?.name ?? 'Organization'"
  >
    <template #actions>
      <span
        v-if="activeOrganization"
        class="hidden text-sm text-muted md:inline"
      >
        {{ membersLoading ? 'Loading members…' : `${members.length} member${members.length === 1 ? '' : 's'}` }}
        <template v-if="formatDate(activeOrganization.createdAt)">
          · Created {{ formatDate(activeOrganization.createdAt) }}
        </template>
      </span>
      <UTooltip text="Refresh">
        <UButton
          color="neutral"
          variant="ghost"
          icon="i-lucide-refresh-ccw"
          aria-label="Refresh"
          :loading="isRefreshing"
          @click="refreshAll"
        />
      </UTooltip>
    </template>

    <ClientOnly>
      <template #fallback>
        <div class="space-y-6">
          <USkeleton class="h-32 rounded-xl" />
          <USkeleton class="h-64 rounded-xl" />
        </div>
      </template>

      <div
        v-if="!activeOrganization"
        class="flex justify-center"
      >
        <UPageCard
          variant="subtle"
          class="w-full max-w-lg"
          icon="i-lucide-building-2"
          title="No active organization"
          description="Pick or create an organization from the menu in the sidebar to manage members and invitations."
        />
      </div>

      <div
        v-else
        class="space-y-10"
      >
        <UCard v-if="canManageMembers">
          <template #header>
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2
                  class="text-lg font-semibold text-highlighted"
                >
                  Invite a member
                </h2>
                <p class="text-sm text-muted">
                  Send an email invitation to collaborate inside this
                  organization.
                </p>
              </div>
            </div>
          </template>

          <UForm
            :state="inviteFormState"
            :schema="inviteMemberSchema"
            class="grid items-start gap-4 md:grid-cols-[minmax(0,1fr)_12rem_auto]"
            @submit="handleInviteSubmit"
          >
            <UFormField
              label="Email"
              name="email"
              required
            >
              <UInput
                v-model="inviteFormState.email"
                type="email"
                placeholder="alex@example.com"
                autocomplete="email"
                class="w-full"
              />
            </UFormField>

            <UFormField
              label="Role"
              name="role"
              required
            >
              <USelectMenu
                v-model="inviteFormState.role"
                :items="roleOptions"
                value-key="value"
                placeholder="Select role"
                class="w-full"
              />
            </UFormField>

            <UButton
              type="submit"
              color="primary"
              icon="i-lucide-send"
              class="md:mt-6"
              :loading="isInviteSubmitting"
            >
              Send invitation
            </UButton>

            <UFormField
              name="resend"
              class="md:col-span-3"
            >
              <UCheckbox
                v-model="inviteFormState.resend"
                label="Resend if this email already has an invitation"
              />
            </UFormField>
          </UForm>
        </UCard>

        <UTabs
          v-model="activeTab"
          :items="tabItems"
          class="gap-0"
        />

        <div
          v-if="activeTab === 'members'"
          class="space-y-4"
        >
          <UAlert
            v-if="membersErrorMessage"
            color="error"
            variant="soft"
            icon="i-lucide-alert-triangle"
            title="Unable to load members"
            :description="membersErrorMessage"
          />

          <UCard>
            <template #header>
              <div class="flex items-center justify-between gap-4">
                <div>
                  <h2
                    class="text-lg font-semibold text-highlighted"
                  >
                    Members
                  </h2>
                  <p class="text-sm text-muted">
                    Update roles or remove users from this workspace.
                  </p>
                </div>
              </div>
            </template>

            <div
              v-if="membersLoading && members.length === 0"
              class="space-y-2"
            >
              <USkeleton
                v-for="index in 4"
                :key="index"
                class="h-12 rounded-lg"
              />
            </div>

            <div
              v-else-if="members.length === 0"
              class="py-10 text-center text-sm text-muted"
            >
              No members found. Invite teammates to get started.
            </div>

            <UTable
              v-else
              :columns="memberTableColumns"
              :data="memberTableRows"
              :loading="membersLoading"
            >
              <template #name-cell="{ row }">
                <div class="flex flex-col">
                  <span
                    class="text-sm font-semibold text-highlighted"
                  >
                    {{ row.getValue("name") }}
                  </span>
                  <span class="text-xs text-muted">
                    {{ row.getValue("email") }}
                  </span>
                </div>
              </template>

              <template #role-cell="{ row }">
                <USelectMenu
                  :model-value="row.getValue('role')"
                  :items="roleOptions"
                  value-key="value"
                  :disabled="
                    !canManageMembers || isUpdatingRole(row.original.raw)
                  "
                  @update:model-value="
                    (value) => onMemberRoleChange(row.original.raw, value)
                  "
                />
              </template>

              <template #joinedAt-cell="{ row }">
                {{ formatDate(row.getValue("joinedAt")) ?? "-" }}
              </template>

              <template #actions-cell="{ row }">
                <div class="flex justify-end gap-2">
                  <UButton
                    size="xs"
                    color="error"
                    variant="ghost"
                    icon="i-lucide-user-minus"
                    :loading="isRemovingMember(row.original.raw)"
                    :disabled="!canRemoveMember(row.original.raw)"
                    @click="removeMember(row.original.raw)"
                  >
                    Remove
                  </UButton>
                </div>
              </template>
            </UTable>
          </UCard>
        </div>

        <div
          v-else-if="activeTab === 'invitations'"
          class="space-y-4"
        >
          <UAlert
            v-if="invitationsErrorMessage"
            color="error"
            variant="soft"
            icon="i-lucide-alert-triangle"
            title="Unable to load invitations"
            :description="invitationsErrorMessage"
          />

          <UCard>
            <template #header>
              <div class="flex items-center justify-between gap-4">
                <div>
                  <h2
                    class="text-lg font-semibold text-highlighted"
                  >
                    Pending invitations
                  </h2>
                  <p class="text-sm text-muted">
                    Track outstanding invites and resend or revoke access.
                  </p>
                </div>
                <UButton
                  color="neutral"
                  variant="soft"
                  icon="i-lucide-refresh-ccw"
                  :loading="invitationsLoading"
                  @click="() => refreshInvitations()"
                >
                  Refresh
                </UButton>
              </div>
            </template>

            <div
              v-if="invitationsLoading && invitations.length === 0"
              class="space-y-2"
            >
              <USkeleton
                v-for="index in 4"
                :key="index"
                class="h-12 rounded-lg"
              />
            </div>

            <div
              v-else-if="invitations.length === 0"
              class="py-10 text-center text-sm text-muted"
            >
              No pending invitations. Invite teammates using the form above.
            </div>

            <UTable
              v-else
              :columns="invitationTableColumns"
              :data="invitationTableRows"
              :loading="invitationsLoading"
            >
              <template #email-cell="{ row }">
                <div class="flex flex-col">
                  <span
                    class="text-sm font-semibold text-highlighted"
                  >
                    {{ row.getValue("email") }}
                  </span>
                  <span class="text-xs text-muted">
                    Invited by
                    {{ inviterName(row.original.raw.inviterId) }}
                  </span>
                </div>
              </template>

              <template #role-cell="{ row }">
                <UBadge
                  variant="soft"
                  color="neutral"
                  class="capitalize"
                >
                  {{ row.getValue("role") }}
                </UBadge>
              </template>

              <template #status-cell="{ row }">
                <UBadge
                  :color="
                    row.getValue('status') === 'pending'
                      ? 'primary'
                      : 'neutral'
                  "
                  variant="soft"
                  class="capitalize"
                >
                  {{ row.getValue("status") }}
                </UBadge>
              </template>

              <template #expiresAt-cell="{ row }">
                {{ formatDate(row.getValue("expiresAt")) ?? "-" }}
              </template>

              <template #actions-cell="{ row }">
                <div class="flex justify-end gap-2">
                  <UButton
                    size="xs"
                    color="primary"
                    variant="ghost"
                    icon="i-lucide-send"
                    :loading="isResending(row.original.raw)"
                    @click="resendInvitation(row.original.raw)"
                  >
                    Resend
                  </UButton>
                  <UButton
                    size="xs"
                    color="error"
                    variant="ghost"
                    icon="i-lucide-x"
                    :loading="isCancelling(row.original.raw)"
                    @click="cancelInvitation(row.original.raw)"
                  >
                    Cancel
                  </UButton>
                </div>
              </template>
            </UTable>
          </UCard>
        </div>

        <div
          v-else-if="activeTab === 'tags'"
          class="space-y-4"
        >
          <TagEditorSlideover
            v-model:open="isTagSlideoverOpen"
            @created="refreshTags"
          />

          <UAlert
            v-if="tagsErrorMessage"
            color="error"
            variant="soft"
            icon="i-lucide-alert-triangle"
            title="Unable to load tags"
            :description="tagsErrorMessage"
          />

          <UCard>
            <template #header>
              <div class="flex items-center justify-between gap-4">
                <div>
                  <h2
                    class="text-lg font-semibold text-highlighted"
                  >
                    Organization tags
                  </h2>
                  <p class="text-sm text-muted">
                    Manage tags used to categorize orders.
                  </p>
                </div>
                <div class="flex gap-2">
                  <UButton
                    icon="i-lucide-plus"
                    @click="openCreateTagEditor"
                  >
                    New tag
                  </UButton>
                </div>
              </div>
            </template>

            <div
              v-if="tagsLoading && organizationTags.length === 0"
              class="space-y-2"
            >
              <USkeleton
                v-for="index in 4"
                :key="index"
                class="h-12 rounded-lg"
              />
            </div>

            <div
              v-else-if="organizationTags.length === 0"
              class="py-10 text-center text-sm text-muted"
            >
              No tags yet. Create a tag to help organize orders.
            </div>

            <div
              v-else
              class="space-y-3"
            >
              <div
                v-for="tag in organizationTags"
                :key="tag.id"
                class="flex items-center justify-between rounded-lg border border-default p-3"
              >
                <div class="flex items-center gap-3">
                  <span
                    class="h-4 w-4 rounded-full"
                    :style="{ backgroundColor: tag.color }"
                  />
                  <span class="font-medium text-highlighted">
                    {{ tag.name }}
                  </span>
                </div>
                <div class="flex gap-2">
                  <UButton
                    v-if="canManageMembers"
                    size="xs"
                    color="error"
                    variant="ghost"
                    icon="i-lucide-trash-2"
                    :loading="isDeletingTag(tag.id)"
                    @click="deleteTag(tag)"
                  >
                    Delete
                  </UButton>
                </div>
              </div>
            </div>
          </UCard>
        </div>

        <div
          v-else-if="activeTab === 'api-keys'"
          class="space-y-4"
        >
          <ApiKeyManager
            v-if="canDeleteOrganization"
            :organization-id="activeOrganization.id"
          />
          <UAlert
            v-else
            color="neutral"
            variant="soft"
            icon="i-lucide-lock-keyhole"
            title="Owner access required"
            description="Only organization owners can manage API keys."
          />
        </div>

        <UCard v-if="canDeleteOrganization">
          <template #header>
            <div class="flex items-center gap-2">
              <UIcon
                name="i-lucide-alert-triangle"
                class="size-5 text-error"
              />
              <h2 class="text-lg font-semibold text-error">
                Danger zone
              </h2>
            </div>
          </template>

          <div class="space-y-4">
            <div class="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p class="font-medium text-highlighted">
                  Delete this organization
                </p>
                <p class="text-sm text-muted">
                  Once you delete an organization, there is no going back. All
                  orders, tags, and members will be permanently removed.
                </p>
              </div>
              <UButton
                color="error"
                variant="solid"
                icon="i-lucide-trash-2"
                :loading="isDeletingOrganization"
                @click="handleDeleteOrganization"
              >
                Delete organization
              </UButton>
            </div>
          </div>
        </UCard>
      </div>
    </ClientOnly>
  </DashboardPage>
</template>

<script setup lang="ts">
import {
  computed,
  reactive,
  ref,
  type Ref,
  onServerPrefetch
} from 'vue'
import { z } from 'zod'
import type { FormSubmitEvent, TableColumn } from '#ui/types'

definePageMeta({
  layout: 'app'
})

const auth = useAuth()
const toast = useToast()
const confirm = useConfirm()

const activeMemberQuery = auth.client.useActiveMember()

const {
  organization: activeOrganization,
  fetchCurrentOrganization,
  deleteTeam,
  fetchOrganizations
} = useOrgs()

onServerPrefetch(async () => {
  await fetchCurrentOrganization()
})

if (import.meta.client) {
  if (!activeOrganization.value) {
    void fetchCurrentOrganization()
  }
}
const activeMember = computed(() => activeMemberQuery.value.data ?? null)

type ListMembersResult = { data: (typeof auth.client.$Infer.Member)[] }
type OrganizationMember = NonNullable<ListMembersResult['data']>[number]

type ListInvitationsResult = { data: (typeof auth.client.$Infer.Invitation)[] }
type OrganizationInvitation = NonNullable<
  ListInvitationsResult['data']
>[number]
type Role = (typeof auth.client.$Infer.Invitation)['role']

const { data: membersData, status: membersStatus, error: membersError, refresh: refreshMembers } = useAsyncData<{ members: OrganizationMember[] }>(
  () => `members-${activeOrganization.value?.id ?? 'none'}`,
  async () => {
    if (!activeOrganization.value?.id) return { members: [] }
    const { data, error } = await auth.client.organization.listMembers({
      query: { organizationId: activeOrganization.value.id }
    })
    if (error) throw error
    return { members: (data.members as OrganizationMember[]) ?? [] }
  },
  {
    watch: [() => activeOrganization.value?.id],
  }
)

const members = computed(() => membersData.value?.members ?? [])
const membersLoading = computed(() => membersStatus.value === 'pending')

const { data: invitationsData, status: invitationsStatus, error: invitationsError, refresh: refreshInvitations } = useAsyncData<OrganizationInvitation[]>(
  () => `invitations-${activeOrganization.value?.id ?? 'none'}`,
  async () => {
    if (!activeOrganization.value?.id) return []
    const { data, error } = await auth.client.organization.listInvitations({
      query: { organizationId: activeOrganization.value.id }
    })
    if (error) throw error
    return data ?? []
  },
  {
    watch: [() => activeOrganization.value?.id],
  }
)

const invitations = computed(() => invitationsData.value ?? [])
const invitationsLoading = computed(() => invitationsStatus.value === 'pending')

const activeTab = ref<'members' | 'invitations' | 'tags' | 'api-keys'>('members')

const updatingMemberIds = ref(new Set<string>())
const removingMemberIds = ref(new Set<string>())
const resendingInvitationIds = ref(new Set<string>())
const cancellingInvitationIds = ref(new Set<string>())
const deletingTagIds = ref(new Set<string>())

type OrganizationTag = {
  id: string
  name: string
  color: string
  createdAt: Date | string
}

const { data: tagsData, status: tagsStatus, error: tagsError, refresh: refreshTags } = useAsyncData<{ tags: OrganizationTag[] }>(
  () => `tags-${activeOrganization.value?.id ?? 'none'}`,
  async () => {
    if (!activeOrganization.value?.id) return { tags: [] }
    const data = $fetch<{ tags: OrganizationTag[] }>('/api/tags')
    return data
  },
  {
    watch: [() => activeOrganization.value?.id],
  }
)

const organizationTags = computed(() => tagsData.value?.tags ?? [])
const tagsLoading = computed(() => tagsStatus.value === 'pending')

const membersErrorMessage = computed(() => membersError.value ? String(membersError.value) : null)
const invitationsErrorMessage = computed(() => invitationsError.value ? String(invitationsError.value) : null)
const tagsErrorMessage = computed(() => tagsError.value ? String(tagsError.value) : null)

const isTagSlideoverOpen = ref(false)

function openCreateTagEditor() {
  isTagSlideoverOpen.value = true
}

const inviteMemberSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  role: z.string().min(1, 'Role is required'),
  resend: z.boolean().default(false)
})

type InviteForm = z.infer<typeof inviteMemberSchema>

const inviteFormState = reactive<InviteForm>({
  email: '',
  role: 'member',
  resend: false
})


const memberTableRows = computed(() =>
  members.value.map(member => ({
    id: resolveMemberId(member),
    name: member.user?.name ?? member.user?.email ?? 'Unknown member',
    email: member.user?.email ?? '-',
    role: primaryRole(member),
    joinedAt: member.createdAt ?? null,
    raw: member
  }))
)

const invitationTableRows = computed(() =>
  invitations.value
    .filter(invitation => invitation.status !== 'canceled')
    .filter(invitation => invitation.status !== 'accepted')
    .map(invitation => ({
      id: invitation.id,
      email: invitation.email,
      role: primaryRole(invitation),
      status: invitation.status ?? 'pending',
      expiresAt: invitation.expiresAt ?? null,
      raw: invitation
    }))
)

const tabItems = computed(() => [
  {
    label: 'Members',
    value: 'members',
    icon: 'i-lucide-users',
    badge: members.value.length ? { label: String(members.value.length), color: 'neutral' as const, variant: 'soft' as const } : undefined
  },
  {
    label: 'Invitations',
    value: 'invitations',
    icon: 'i-lucide-mail',
    badge: invitationTableRows.value.length ? { label: String(invitationTableRows.value.length), color: 'primary' as const, variant: 'soft' as const } : undefined
  },
  { label: 'Tags', value: 'tags', icon: 'i-lucide-tags' },
  { label: 'API keys', value: 'api-keys', icon: 'i-lucide-key-round' }
])

function inviterName(inviterId?: string | null) {
  if (!inviterId) return 'unknown'
  const inviter = members.value.find(member => member.userId === inviterId)
  return inviter?.user?.name || inviter?.user?.email || 'a former member'
}

type MemberTableRow = (typeof memberTableRows)['value'][number]

const memberTableColumns: TableColumn<MemberTableRow>[] = [
  { accessorKey: 'name', header: 'Member' },
  { accessorKey: 'role', header: 'Role' },
  { accessorKey: 'joinedAt', header: 'Joined' },
  { accessorKey: 'actions', header: '' }
]
type InvitationTableRow = (typeof invitationTableRows)['value'][number]
const invitationTableColumns: TableColumn<InvitationTableRow>[] = [
  { accessorKey: 'email', header: 'Invitee' },
  { accessorKey: 'role', header: 'Role' },
  { accessorKey: 'status', header: 'Status' },
  { accessorKey: 'expiresAt', header: 'Expires' },
  { accessorKey: 'actions', header: '' }
]
const availableRoles = computed(() => {
  const roles = new Set<string>(['owner', 'admin', 'member'])
  for (const member of members.value) {
    for (const role of extractRoles(member.role)) roles.add(role)
  }
  for (const invitation of invitations.value) {
    for (const role of extractRoles(invitation.role)) roles.add(role)
  }
  return [...roles].sort()
})

const roleOptions = computed(() =>
  availableRoles.value.map(role => ({
    label: role.charAt(0).toUpperCase() + role.slice(1),
    value: role
  }))
)

const canManageMembers = computed(() => {
  const roles = extractRoles(activeMember.value?.role)
  return roles.includes('owner') || roles.includes('admin')
})

const canDeleteOrganization = computed(() => {
  const roles = extractRoles(activeMember.value?.role)
  return roles.includes('owner')
})

const isDeletingOrganization = ref(false)

const isRefreshing = computed(
  () => membersLoading.value || invitationsLoading.value || tagsLoading.value
)

function extractRoles(input: unknown): Role[] {
  if (!input) return []
  if (Array.isArray(input)) {
    return input
      .map(role => (typeof role === 'string' ? role.trim() : ''))
      .filter((role): role is Role => Boolean(role))
      .filter(Boolean)
  }
  if (typeof input === 'string') {
    return input
      .split(',')
      .map(role => role.trim())
      .filter((role): role is Role => Boolean(role))
      .filter(Boolean)
  }
  return []
}

function primaryRole(entity: { role?: Role | Role[] | null }): Role {
  const [first] = extractRoles(entity.role)
  return first ?? 'member'
}

function resolveMemberId(member: OrganizationMember) {
  return (
    member.id
    ?? (member as { memberId?: string }).memberId
    ?? member.userId
    ?? member.user?.email
    ?? `member:${primaryRole(member)}`
  )
}

function extractErrorMessage(err: unknown) {
  if (typeof err === 'string') return err
  if (err instanceof Error) return err.message
  if (err && typeof err === 'object') {
    const candidate = err as {
      message?: string
      data?: { statusMessage?: string }
    }
    return (
      candidate.message
      ?? candidate.data?.statusMessage
      ?? 'Something went wrong. Please try again.'
    )
  }
  return 'Something went wrong. Please try again.'
}

async function refreshAll() {
  await Promise.all([
    fetchCurrentOrganization(),
    refreshMembers(),
    refreshInvitations(),
    refreshTags(),
    activeMemberQuery.value.refetch?.()
  ])
}

function resetInviteForm() {
  inviteFormState.email = ''
  inviteFormState.role = availableRoles.value.includes('member')
    ? 'member'
    : (availableRoles.value[0] ?? 'member')
  inviteFormState.resend = false
}

const isInviteSubmitting = ref(false)

async function handleInviteSubmit(event: FormSubmitEvent<InviteForm>) {
  if (!activeOrganization.value) return
  isInviteSubmitting.value = true
  try {
    const payload = {
      email: event.data.email,
      role: event.data.role as 'member' | 'admin' | 'owner',
      resend: event.data.resend,
      organizationId: activeOrganization.value.id
    }
    const { error } = await auth.client.organization.inviteMember(payload)
    if (error) throw error
    toast.add({
      title: 'Invitation sent',
      color: 'success',
      icon: 'i-lucide-send'
    })
    resetInviteForm()
    await refreshInvitations()
  } catch (err) {
    toast.add({
      title: 'Unable to send invitation',
      description: extractErrorMessage(err),
      color: 'error',
      icon: 'i-lucide-alert-triangle'
    })
  } finally {
    isInviteSubmitting.value = false
  }
}

const loadingGuard = (set: Ref<Set<string>>) => ({
  add(id: string) {
    const next = new Set(set.value)
    next.add(id)
    set.value = next
  },
  remove(id: string) {
    const next = new Set(set.value)
    next.delete(id)
    set.value = next
  },
  has(id: string) {
    return set.value.has(id)
  }
})

const roleLoading = loadingGuard(updatingMemberIds)
const removeLoading = loadingGuard(removingMemberIds)
const resendLoading = loadingGuard(resendingInvitationIds)
const cancelLoading = loadingGuard(cancellingInvitationIds)

function isUpdatingRole(member: OrganizationMember) {
  return roleLoading.has(resolveMemberId(member))
}

function isRemovingMember(member: OrganizationMember) {
  return removeLoading.has(resolveMemberId(member))
}

function isResending(invitation: OrganizationInvitation) {
  return resendLoading.has(invitation.id)
}

function isCancelling(invitation: OrganizationInvitation) {
  return cancelLoading.has(invitation.id)
}

function canRemoveMember(member: OrganizationMember) {
  if (!canManageMembers.value) return false
  const memberId = member.userId
  const currentId = activeMember.value?.userId ?? activeMember.value?.id
  if (memberId && currentId && memberId === currentId) return false
  return true
}

async function onMemberRoleChange(
  member: OrganizationMember,
  newRole: string | null
) {
  if (!newRole || !activeOrganization.value) return
  if (primaryRole(member) === newRole) return
  const id = resolveMemberId(member)
  roleLoading.add(id)
  try {
    const { error } = await auth.client.organization.updateMemberRole({
      role: newRole,
      memberId: member.id ?? member.userId ?? id,
      organizationId: activeOrganization.value.id
    })
    if (error) throw error
    toast.add({
      title: 'Role updated',
      color: 'success',
      icon: 'i-lucide-shield-check'
    })
    await Promise.all([refreshMembers(), activeMemberQuery.value.refetch?.()])
  } catch (err) {
    toast.add({
      title: 'Unable to update role',
      description: extractErrorMessage(err),
      color: 'error',
      icon: 'i-lucide-alert-triangle'
    })
  } finally {
    roleLoading.remove(id)
  }
}

async function removeMember(member: OrganizationMember) {
  if (!activeOrganization.value) return
  if (!canRemoveMember(member)) return
  const id = resolveMemberId(member)
  const confirmed = await confirm({
    title: `Remove ${member.user?.name || member.user?.email || 'this member'}?`,
    description: 'They will lose access to this organization’s projects and orders. You can invite them again later.',
    confirmLabel: 'Remove member',
    icon: 'i-lucide-user-minus'
  })
  if (!confirmed) return
  removeLoading.add(id)
  try {
    const { error } = await auth.client.organization.removeMember({
      memberIdOrEmail: member.id ?? member.userId ?? member.user?.email ?? id,
      organizationId: activeOrganization.value.id
    })
    if (error) throw error
    toast.add({
      title: 'Member removed',
      color: 'success',
      icon: 'i-lucide-user-minus'
    })
    await Promise.all([refreshMembers(), activeMemberQuery.value.refetch?.()])
  } catch (err) {
    toast.add({
      title: 'Unable to remove member',
      description: extractErrorMessage(err),
      color: 'error',
      icon: 'i-lucide-alert-triangle'
    })
  } finally {
    removeLoading.remove(id)
  }
}

async function resendInvitation(invitation: OrganizationInvitation) {
  if (!activeOrganization.value) return
  resendLoading.add(invitation.id)
  try {
    const { error } = await auth.client.organization.inviteMember({
      email: invitation.email,
      role: invitation.role,
      resend: true,
      organizationId: activeOrganization.value.id
    })
    if (error) throw error
    toast.add({
      title: 'Invitation resent',
      color: 'success',
      icon: 'i-lucide-send'
    })
    await refreshInvitations()
  } catch (err) {
    toast.add({
      title: 'Unable to resend invitation',
      description: extractErrorMessage(err),
      color: 'error',
      icon: 'i-lucide-alert-triangle'
    })
  } finally {
    resendLoading.remove(invitation.id)
  }
}

async function cancelInvitation(invitation: OrganizationInvitation) {
  if (!activeOrganization.value) return
  const confirmed = await confirm({
    title: 'Cancel invitation?',
    description: `The invite link sent to ${invitation.email} will stop working.`,
    confirmLabel: 'Cancel invitation',
    cancelLabel: 'Keep invitation'
  })
  if (!confirmed) return
  cancelLoading.add(invitation.id)
  try {
    const { error } = await auth.client.organization.cancelInvitation({
      invitationId: invitation.id
    })
    if (error) throw error
    toast.add({
      title: 'Invitation canceled',
      color: 'success',
      icon: 'i-lucide-x'
    })
    await refreshInvitations()
  } catch (err) {
    toast.add({
      title: 'Unable to cancel invitation',
      description: extractErrorMessage(err),
      color: 'error',
      icon: 'i-lucide-alert-triangle'
    })
  } finally {
    cancelLoading.remove(invitation.id)
  }
}

const tagLoading = loadingGuard(deletingTagIds)

function isDeletingTag(tagId: string) {
  return tagLoading.has(tagId)
}

async function deleteTag(tag: OrganizationTag) {
  if (!activeOrganization.value) return
  const confirmed = await confirm({
    title: `Delete the “${tag.name}” tag?`,
    description: 'It will be removed from every order that uses it.',
    confirmLabel: 'Delete tag',
    icon: 'i-lucide-tag'
  })
  if (!confirmed) return
  tagLoading.add(tag.id)
  try {
    await $fetch(`/api/tags/${tag.id}`, {
      method: 'DELETE'
    })
    toast.add({
      title: 'Tag deleted',
      color: 'success',
      icon: 'i-lucide-trash-2'
    })
    await refreshTags()
  } catch (err) {
    toast.add({
      title: 'Unable to delete tag',
      description: extractErrorMessage(err),
      color: 'error',
      icon: 'i-lucide-alert-triangle'
    })
  } finally {
    tagLoading.remove(tag.id)
  }
}

async function handleDeleteOrganization() {
  if (!activeOrganization.value) return
  const confirmed = await confirm({
    title: `Delete ${activeOrganization.value.name}?`,
    description: 'All projects, orders, tags and memberships in this organization will be permanently deleted. This can’t be undone.',
    confirmLabel: 'Delete organization',
    icon: 'i-lucide-alert-triangle'
  })
  if (!confirmed) return
  isDeletingOrganization.value = true
  try {
    await deleteTeam(activeOrganization.value.id, { showToast: false })
    toast.add({
      title: 'Organization deleted',
      description:
        'The organization and all its data have been permanently removed.',
      color: 'success',
      icon: 'i-lucide-trash-2'
    })
    await fetchOrganizations()
    await navigateTo('/app')
  } catch (err) {
    toast.add({
      title: 'Unable to delete organization',
      description: extractErrorMessage(err),
      color: 'error',
      icon: 'i-lucide-alert-triangle'
    })
  } finally {
    isDeletingOrganization.value = false
  }
}

function formatDate(value: string | Date | null | undefined) {
  if (!value) return null
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(new Date(value))
  } catch {
    return null
  }
}
</script>
