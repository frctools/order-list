<script setup lang="ts">
import type { DropdownMenuItem, FormSubmitEvent } from '#ui/types'
import { z } from 'zod'

const emit = defineEmits<{
  change: [projectId: string]
}>()

const {
  projects,
  activeProjects,
  project,
  isLoading,
  selectProject,
  createProject,
  updateProject
} = useProjects()
const toast = useToast()

const isCreateOpen = ref(false)
const isManageOpen = ref(false)
const isCreating = ref(false)
const updatingIds = ref<string[]>([])

const schema = z.object({
  name: z.string().trim().min(1, 'Project name is required').max(80),
  description: z.string().trim().max(500).optional(),
  color: z.string().regex(/^#[0-9a-f]{6}$/i)
})

type ProjectForm = z.infer<typeof schema>

const state = reactive<ProjectForm>({
  name: '',
  description: '',
  color: '#2563eb'
})

const dropdownItems = computed<DropdownMenuItem[][]>(() => [
  activeProjects.value.map(item => ({
    label: item.name,
    description: item.description || undefined,
    icon: item.id === project.value?.id
      ? 'i-lucide-check'
      : 'i-lucide-folder-kanban',
    onSelect: () => handleSelect(item.id)
  })),
  [
    {
      label: 'New project',
      icon: 'i-lucide-folder-plus',
      onSelect: () => {
        isCreateOpen.value = true
      }
    },
    {
      label: 'Manage projects',
      icon: 'i-lucide-settings-2',
      onSelect: () => {
        isManageOpen.value = true
      }
    }
  ]
])

function handleSelect(id: string) {
  if (!selectProject(id)) return
  emit('change', id)
}

async function handleCreate(event: FormSubmitEvent<ProjectForm>) {
  isCreating.value = true
  try {
    const created = await createProject(event.data)
    isCreateOpen.value = false
    state.name = ''
    state.description = ''
    state.color = '#2563eb'
    emit('change', created.id)
    toast.add({
      title: 'Project created',
      description: `${created.name} is ready for orders.`,
      color: 'success',
      icon: 'i-lucide-folder-check'
    })
  } finally {
    isCreating.value = false
  }
}

async function toggleArchived(id: string, isArchived: boolean) {
  updatingIds.value = [...updatingIds.value, id]
  try {
    await updateProject(id, { isArchived: !isArchived })
    if (project.value) emit('change', project.value.id)
  } finally {
    updatingIds.value = updatingIds.value.filter(item => item !== id)
  }
}
</script>

<template>
  <div class="flex items-center gap-2">
    <UDropdownMenu :items="dropdownItems">
      <UButton
        color="neutral"
        variant="soft"
        trailing-icon="i-lucide-chevrons-up-down"
        :loading="isLoading"
        class="max-w-64"
      >
        <span
          class="size-2.5 shrink-0 rounded-full"
          :style="{ backgroundColor: project?.color ?? '#94a3b8' }"
        />
        <span class="truncate">{{ project?.name ?? 'Select project' }}</span>
      </UButton>
    </UDropdownMenu>

    <ClientOnly>
      <UModal
        v-model:open="isCreateOpen"
        title="Create a project"
        description="Give this order board a focused workspace inside your organization."
      >
        <template #body>
          <UForm
            :schema="schema"
            :state="state"
            class="space-y-4"
            @submit="handleCreate"
          >
            <UFormField name="name" label="Name" required>
              <UInput
                v-model="state.name"
                class="w-full"
                placeholder="2027 robot"
                autofocus
              />
            </UFormField>
            <UFormField name="description" label="Description">
              <UTextarea
                v-model="state.description"
                class="w-full"
                placeholder="What is this project building?"
              />
            </UFormField>
            <UFormField name="color" label="Color">
              <div class="flex items-center gap-3">
                <UInput v-model="state.color" type="color" class="w-16" />
                <UInput v-model="state.color" class="flex-1" />
              </div>
            </UFormField>
            <div class="flex justify-end gap-2">
              <UButton
                color="neutral"
                variant="ghost"
                @click="isCreateOpen = false"
              >
                Cancel
              </UButton>
              <UButton type="submit" :loading="isCreating">
                Create project
              </UButton>
            </div>
          </UForm>
        </template>
      </UModal>

      <UModal
        v-model:open="isManageOpen"
        title="Manage projects"
        description="Archive completed work without losing its order history."
      >
        <template #body>
          <div class="space-y-3">
            <UCard v-for="item in projects" :key="item.id" variant="subtle">
              <div class="flex items-center justify-between gap-4">
                <div class="flex min-w-0 items-center gap-3">
                  <span
                    class="size-3 shrink-0 rounded-full"
                    :style="{ backgroundColor: item.color }"
                  />
                  <div class="min-w-0">
                    <p class="truncate font-medium">{{ item.name }}</p>
                    <p class="truncate text-xs text-muted">
                      {{ item.description || 'No description' }}
                    </p>
                  </div>
                </div>
                <UButton
                  size="sm"
                  color="neutral"
                  variant="soft"
                  :icon="item.isArchived ? 'i-lucide-archive-restore' : 'i-lucide-archive'"
                  :disabled="!item.isArchived && activeProjects.length <= 1"
                  :loading="updatingIds.includes(item.id)"
                  @click="toggleArchived(item.id, item.isArchived)"
                >
                  {{ item.isArchived ? 'Restore' : 'Archive' }}
                </UButton>
              </div>
            </UCard>
          </div>
        </template>
      </UModal>
    </ClientOnly>
  </div>
</template>
