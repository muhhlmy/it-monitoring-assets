<script setup>
import BaseSkeleton from './BaseSkeleton.vue'

defineProps({
  lines: {
    type: Number,
    default: 3,
  },
  height: {
    type: String,
    default: '0.75rem',
  },
  gap: {
    type: String,
    default: '0.5rem',
  },
  lastLineWidth: {
    type: String,
    default: '60%',
  },
})
</script>

<template>
  <div class="flex flex-col" :style="{ gap: gap }">
    <BaseSkeleton
      v-for="index in lines"
      :key="index"
      :height="height"
      :width="index === lines && lines > 1 ? lastLineWidth : '100%'"
      radius="md"
    />
  </div>
</template>
