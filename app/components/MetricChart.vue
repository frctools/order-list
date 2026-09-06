<script setup lang="ts">
type MetricPoint = {
  timestamp: string
  value: number
}

const props = withDefaults(defineProps<{
  points: MetricPoint[]
  formatValue?: (value: number) => string
  color?: string
}>(), {
  formatValue: (value: number) => String(value),
  color: '#2563eb'
})

const width = 720
const height = 240
const padding = { top: 16, right: 16, bottom: 34, left: 68 }
const innerWidth = width - padding.left - padding.right
const innerHeight = height - padding.top - padding.bottom

const domain = computed(() => {
  const values = props.points.map(point => point.value)
  const rawMin = Math.min(...values)
  const rawMax = Math.max(...values)
  const spread = rawMax - rawMin
  const buffer = spread === 0 ? Math.max(Math.abs(rawMax) * 0.1, 1) : spread * 0.08
  return { min: rawMin - buffer, max: rawMax + buffer }
})

const chartPoints = computed(() =>
  props.points.map((point, index) => {
    const x = props.points.length === 1
      ? padding.left + innerWidth / 2
      : padding.left + (index / (props.points.length - 1)) * innerWidth
    const y = padding.top
      + ((domain.value.max - point.value)
        / (domain.value.max - domain.value.min))
      * innerHeight
    return { ...point, x, y }
  })
)

const path = computed(() =>
  chartPoints.value
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ')
)

const gridLines = computed(() =>
  Array.from({ length: 5 }, (_, index) => {
    const ratio = index / 4
    return {
      y: padding.top + ratio * innerHeight,
      value: domain.value.max - ratio * (domain.value.max - domain.value.min)
    }
  })
)

const dateLabels = computed(() => {
  if (!props.points.length) return []
  const indexes = props.points.length === 1
    ? [0]
    : [0, Math.floor((props.points.length - 1) / 2), props.points.length - 1]
  return [...new Set(indexes)].map((index) => ({
    x: chartPoints.value[index]!.x,
    label: new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric'
    }).format(new Date(props.points[index]!.timestamp))
  }))
})

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value))
}
</script>

<template>
  <div v-if="points.length" class="w-full overflow-x-auto">
    <svg
      :viewBox="`0 0 ${width} ${height}`"
      class="h-64 min-w-[36rem] w-full"
      role="img"
      aria-label="Time-series chart"
    >
      <g v-for="line in gridLines" :key="line.y">
        <line
          :x1="padding.left"
          :x2="width - padding.right"
          :y1="line.y"
          :y2="line.y"
          stroke="currentColor"
          stroke-opacity="0.12"
        />
        <text
          :x="padding.left - 10"
          :y="line.y + 4"
          text-anchor="end"
          class="fill-muted text-[11px]"
        >
          {{ formatValue(line.value) }}
        </text>
      </g>

      <path
        :d="path"
        fill="none"
        :stroke="color"
        stroke-width="3"
        stroke-linecap="round"
        stroke-linejoin="round"
      />

      <circle
        v-for="point in chartPoints"
        :key="`${point.timestamp}-${point.value}`"
        :cx="point.x"
        :cy="point.y"
        r="4"
        :fill="color"
        stroke="white"
        stroke-width="2"
      >
        <title>{{ formatTimestamp(point.timestamp) }} · {{ formatValue(point.value) }}</title>
      </circle>

      <text
        v-for="label in dateLabels"
        :key="label.x"
        :x="label.x"
        :y="height - 8"
        text-anchor="middle"
        class="fill-muted text-[11px]"
      >
        {{ label.label }}
      </text>
    </svg>
  </div>
</template>
