<template>
  <div class="space-y-4">
    <UAlert
      v-if="createdKey"
      color="warning"
      variant="soft"
      icon="i-lucide-key-round"
      title="Copy this key now"
      description="For security, the full API key is shown only once."
    >
      <template #description>
        <div class="mt-3 flex gap-2">
          <UInput
            :model-value="createdKey"
            readonly
            class="min-w-0 flex-1 font-mono"
          />
          <UButton
            color="neutral"
            variant="soft"
            icon="i-lucide-copy"
            @click="copyCreatedKey"
          >
            Copy
          </UButton>
        </div>
      </template>
    </UAlert>

    <UCard>
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 class="text-lg font-semibold text-highlighted">
              API keys
            </h2>
            <p class="text-sm text-muted">
              Keys grant access to this organization. Treat them like passwords.
            </p>
          </div>
          <UButton
            color="neutral"
            variant="soft"
            icon="i-lucide-refresh-ccw"
            :loading="pending"
            @click="() => refresh()"
          >
            Refresh
          </UButton>
        </div>
      </template>

      <form
        class="flex flex-wrap items-end gap-3 border-b border-default pb-5"
        @submit.prevent="createKey"
      >
        <UFormField
          label="Key name"
          required
          class="min-w-56 flex-1"
        >
          <UInput
            v-model="name"
            placeholder="Production integration"
            maxlength="32"
            :disabled="creating"
          />
        </UFormField>
        <UButton
          type="submit"
          icon="i-lucide-plus"
          :loading="creating"
          :disabled="!name.trim()"
        >
          Create key
        </UButton>
      </form>

      <div
        v-if="pending && !keys.length"
        class="space-y-3 pt-5"
      >
        <USkeleton
          v-for="index in 3"
          :key="index"
          class="h-16 rounded-lg"
        />
      </div>
      <p
        v-else-if="!keys.length"
        class="py-10 text-center text-sm text-muted"
      >
        No API keys yet.
      </p>
      <div
        v-else
        class="divide-y divide-default pt-3"
      >
        <div
          v-for="key in keys"
          :key="key.id"
          class="flex flex-wrap items-center justify-between gap-3 py-3"
        >
          <div class="min-w-0">
            <p class="font-medium text-highlighted">
              {{ key.name || 'Unnamed key' }}
            </p>
            <p class="font-mono text-xs text-muted">
              {{ key.start || key.prefix || 'Hidden' }}••••••
            </p>
          </div>
          <div class="flex items-center gap-3">
            <span class="text-xs text-muted">
              Created {{ formatDate(key.createdAt) }}
            </span>
            <UButton
              size="xs"
              color="error"
              variant="ghost"
              icon="i-lucide-trash-2"
              :loading="deletingIds.has(key.id)"
              @click="deleteKey(key)"
            >
              Revoke
            </UButton>
          </div>
        </div>
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
type ApiKeySummary = {
  id: string
  name: string | null
  start: string | null
  prefix: string | null
  createdAt: Date | string
}

const props = defineProps<{ organizationId: string }>()

const auth = useAuth()
const toast = useToast()
const confirm = useConfirm()
const name = ref('')
const creating = ref(false)
const createdKey = ref<string | null>(null)
const deletingIds = ref(new Set<string>())

const { data, status, refresh } = await useAsyncData(
  () => `api-keys-${props.organizationId}`,
  async () => {
    const { data, error } = await auth.client.apiKey.list({
      query: {
        configId: 'organization',
        organizationId: props.organizationId,
        sortBy: 'createdAt',
        sortDirection: 'desc'
      }
    })
    if (error) throw error
    return (data?.apiKeys ?? []) as ApiKeySummary[]
  },
  { watch: [() => props.organizationId] }
)

const keys = computed(() => data.value ?? [])
const pending = computed(() => status.value === 'pending')

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Please try again.'
}

async function createKey() {
  const trimmedName = name.value.trim()
  if (!trimmedName) return
  creating.value = true
  createdKey.value = null
  try {
    const { data, error } = await auth.client.apiKey.create({
      configId: 'organization',
      organizationId: props.organizationId,
      name: trimmedName
    })
    if (error || !data?.key) throw error ?? new Error('API key was not returned.')
    createdKey.value = data.key
    name.value = ''
    toast.add({ title: 'API key created', color: 'success', icon: 'i-lucide-key-round' })
    await refresh()
  } catch (error) {
    toast.add({
      title: 'Unable to create API key',
      description: errorMessage(error),
      color: 'error',
      icon: 'i-lucide-alert-triangle'
    })
  } finally {
    creating.value = false
  }
}

async function copyCreatedKey() {
  if (!createdKey.value) return
  await navigator.clipboard.writeText(createdKey.value)
  toast.add({ title: 'API key copied', color: 'success', icon: 'i-lucide-copy' })
}

async function deleteKey(key: ApiKeySummary) {
  const confirmed = await confirm({
    title: `Revoke ${key.name ? `“${key.name}”` : 'this API key'}?`,
    description: 'Anything using this key will immediately lose access. This can’t be undone.',
    confirmLabel: 'Revoke key',
    icon: 'i-lucide-key-round'
  })
  if (!confirmed) return
  const next = new Set(deletingIds.value)
  next.add(key.id)
  deletingIds.value = next
  try {
    const { error } = await auth.client.apiKey.delete({
      configId: 'organization',
      keyId: key.id
    })
    if (error) throw error
    toast.add({ title: 'API key revoked', color: 'success', icon: 'i-lucide-trash-2' })
    await refresh()
  } catch (error) {
    toast.add({
      title: 'Unable to revoke API key',
      description: errorMessage(error),
      color: 'error',
      icon: 'i-lucide-alert-triangle'
    })
  } finally {
    const updated = new Set(deletingIds.value)
    updated.delete(key.id)
    deletingIds.value = updated
  }
}

function formatDate(value: string | Date) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value))
}
</script>
